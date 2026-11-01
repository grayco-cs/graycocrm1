// test_OFFICEDAY.mjs <build-dir> <mirror.json> [shots-dir] — patch OFFICEFIX: "an office day" as office@ (Brittany), start to
// finish, on the real-data mirror (kept outside git) with the REAL function handlers (officefix_bridge.mjs: in-process, fake
// Supabase, nothing leaves; a scheduled function cannot be called by URL, like Netlify). One line per task: works or not,
// the clicks it takes, how long it took, what confused. PASS = every task works, no 401 / 403 / 5xx from our functions
// except the two the test causes on purpose (an approve with e-mail not set up; a reminder on an invoice whose job was
// deleted — production data), no page error, no long task over MAXTASK ms (default 2000), and the OFFICEFIX fixes hold:
// a refused approve keeps its card, the PM is never saved with the workload hint, the data check is under Setup & admin,
// the To-Do money buttons leave with the To-Do list.
// Env: MAXTASK, GC_HARNESS.  Exit 0 = PASS.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wUPG/harness.mjs').href);
const { computer, signIn, sleep, cloud, ACCOUNTS, waitFor } = H;
const BUILD = process.argv[2] && path.resolve(process.argv[2]), MIRROR = process.argv[3], SHOTS = process.argv[4] || '';
if (!BUILD || !MIRROR) { console.error('usage: node test_OFFICEDAY.mjs <build-dir> <mirror.json> [shots-dir]'); process.exit(2); }
const B = await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname), 'officefix_bridge.mjs')).href);
const MAXTASK = +(process.env.MAXTASK || 2000), OFFICE = 'office@grayco-cs.com';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
cloud.clear(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const STAFF = [{ email: OFFICE, name: 'Brittany Pucket', role: 'staff', profile: null, active: true, payroll: true },
  { email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', role: 'admin', active: true, payroll: true }];
const bridge = B.installBridge({ build: BUILD, cloud, accounts: ACCOUNTS, staffRows: STAFF });
const c = await computer('office', { build: BUILD }); c.acceptConfirm = true; c.prompts = [];
await c.ctx.route(u => /supabase\.co\/rest\/v1\/(gc_staff|rpc\/gc_my_access)/.test(u), async r => {
  const u = new URL(r.request().url()); const J = b => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (u.pathname.endsWith('/gc_staff')) return J(STAFF.slice(0, 1)); return J({ email: OFFICE, staff: true, admin: false, payroll: true, office: true, sec2: 1 });
});
await B.routeFunctions(c, bridge);
await c.ctx.addInitScript(() => {
  try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {}
  window.__LT = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__LT.push({ d: Math.round(e.duration), ph: window.__PH || '' }))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  window.__OPENED = []; window.open = function(u){ window.__OPENED.push(String(u || '')); return { closed: false, close(){}, focus(){}, print(){}, addEventListener(){}, document: { write(){}, close(){}, open(){} }, location: {} }; };
  window.print = function(){};
});
const p = () => c.page();
const H_JS = `
window.__vis = e => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 2 && r.height > 2 && st.visibility !== 'hidden' && st.display !== 'none'; };
window.__clickText = (re, root) => { re = new RegExp(re, 'i'); const el = [...(root || document).querySelectorAll('button, [role=button], a, summary')].filter(__vis).find(e => re.test((e.innerText || e.title || '').trim())); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; };
window.__row = k => [...document.querySelectorAll('.apx-row')].find(r => r.getAttribute('data-k') === k);
window.__toasts = () => [...document.querySelectorAll('.apx-toast, [class*=toast], [role=status]')].filter(__vis).map(e => e.innerText.slice(0, 160)).join(' / ');
window.__setV = (el, v) => { const P = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(P, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
window.__go = async v => { window._setView(v); await new Promise(z => setTimeout(z, 2500)); };
window.__kv = async k => { const u = (localStorage.getItem('grayco_sb_url') || 'https://ieeonhpfahmwwecizdut.supabase.co') + '/rest/v1/gc_kv?select=key,value&key=eq.' + k; const j = await (await fetch(u, { headers: { apikey: 'x' } })).json(); let v = j[0] && j[0].value; if (typeof v === 'string') v = JSON.parse(v); if (v && v.v) v = v.v; return v; };
true;`;
const ev = async (fn, arg) => { try { return await p().evaluate(fn, arg); } catch (e) { if (/is not defined|is not a function/.test(e.message)) { await p().evaluate(H_JS); return p().evaluate(fn, arg); } throw e; } };
const RESULTS = []; let fails = 0, stepN = 0;
const ALLOWED = [{ fn: 'portal', status: 502, why: 'approve & send with e-mail not set up (on purpose: the card must stay)' }, { fn: 'office-board', status: 404, why: 'payment reminder on an invoice whose job was deleted (production data)' }];
async function step(name, clicks, f){
  stepN++; const ph = 's' + stepN; c.phase = ph; await ev(ph => { window.__PH = ph; }, ph).catch(() => {});
  const t0 = Date.now(), n0 = c.calls.length; let r;
  try { r = await f(); } catch (e) { r = { ok: false, note: 'threw: ' + String(e.message).slice(0, 200) }; }
  const ms = Date.now() - t0, calls = c.calls.slice(n0);
  const bad = calls.filter(x => (x.status === 401 || x.status === 403 || x.status >= 500 || x.status === 404) && !ALLOWED.some(a => a.fn === x.fn && a.status === x.status && r && r.expect && r.expect.includes(a.fn)));
  const lt = (await ev(ph => window.__LT.filter(x => x.ph === ph).map(x => x.d), ph).catch(() => [])).reduce((a, x) => Math.max(a, x), 0);
  const ok = !!(r && r.ok) && !bad.length && lt <= MAXTASK;
  if (!ok) fails++;
  if (SHOTS) try { await p().screenshot({ path: path.join(SHOTS, String(stepN).padStart(2, '0') + '_' + name.replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 40) + '.png') }); } catch (e) {}
  RESULTS.push({ n: stepN, name, ok, clicks, ms, lt, note: (r && r.note) || '', bad: bad.map(x => x.m + ' ' + x.fn + x.q.split('&')[0] + ' ' + x.status + ' ' + (x.err || '').slice(0, 80)) });
  console.log((ok ? 'ok   ' : 'FAIL ') + stepN + '. ' + name + ' — ' + clicks + ' clicks, ' + ms + ' ms, longest task ' + lt + ' ms' + ((r && r.note) ? ' — ' + r.note : '') + (bad.length ? '  BAD ' + JSON.stringify(bad.map(x => [x.fn + x.q, x.status, (x.err || '').slice(0, 90)])) : ''));
  return r;
}

await signIn(c, OFFICE, 1000);
await waitFor(c, () => document.querySelectorAll('aside button[draggable="true"]').length > 5 && !!(window._crm && window._crm.projects && window._crm.projects.length), null, 150000, 500);
await sleep(8000); await p().evaluate(H_JS);

await step('Sign in → 🏢 Office home', 1, async () => ev(async () => { await __go('officemanager'); const t = document.querySelector('main').innerText; return { ok: /Office Manager Dashboard/.test(t) && /What needs you today/.test(t), note: 'the "E-mail follow-ups" line runs words and buttons together; "Collect overdue invoices ✓" shows a check mark while money is past due' }; }));

/* 2. Approvals */
const AP = await ev(async () => { await __go('approvals'); __clickText('^\\d+\\s+All$'); await new Promise(z => setTimeout(z, 1500));
  const rows = [...document.querySelectorAll('.apx-row')].filter(__vis).map(r => ({ k: r.getAttribute('data-k'), b: [...r.querySelectorAll('button')].filter(__vis).map(b => b.innerText.trim()) }));
  return { all: rows.map(r => r.k), send: rows.filter(r => r.b.includes('✅ Approve & send')).map(r => r.k), deny: rows.filter(r => r.b.includes('✕ Deny') && /^ap2:/.test(r.k)).map(r => r.k), assign: rows.filter(r => r.b.includes('✅ 👤 Assign')).map(r => r.k), n: rows.length }; });
const USED = [];
const act = (k, re, wait) => ev(async ({ k, re, wait }) => { const r = __row(k); if (!r) return 'NOROW'; const b = [...r.querySelectorAll('button')].filter(__vis).find(b => new RegExp(re).test(b.innerText)); if (!b) return 'NOBTN'; b.click(); await new Promise(z => setTimeout(z, wait || 1500)); return 'ok'; }, { k, re, wait });
await step('📋 Approvals: approve & send, e-mail NOT set up → the card stays and says why', 2, async () => {
  const k = AP.send[0]; USED.push(k); await act(k, 'Approve & send'); await act(k, 'Yes, approve', 3500);
  const r = await ev(k => ({ still: !!__row(k), t: __toasts() }), k); await sleep(4000); const r2 = await ev(k => !!__row(k), k);
  return { ok: r2 && /not set up|⚠/.test(r.t + ''), expect: ['portal'], note: r2 ? 'card kept; toast: ' + (r.t || '').slice(0, 90) : 'the card vanished though nothing was sent (before OFFICEFIX)' };
});
process.env.RESEND_API_KEY = 're_placeholder_not_a_key'; delete process.env.PORTAL_MAIL_OFF;   /* e-mail "set up" (the fake host answers) */
await step('📋 Approvals: approve & send (two-step confirm)', 2, async () => { const k = AP.send[1] || AP.send[0]; USED.push(k); await act(k, 'Approve & send'); await act(k, 'Yes, approve', 4000); const r = await ev(k => ({ still: !!__row(k), t: __toasts() }), k); const call = c.calls.filter(x => x.fn === 'portal' && /"op":"approve"/.test(x.b)).pop(); return { ok: !r.still && call && call.status === 200, note: (r.t || '').slice(0, 80) }; });
await step('📋 Approvals: deny (5 s undo, then sent back; no place for a reason)', 1, async () => { const k = AP.deny.find(x => !AP.send.slice(0, 2).includes(x)); USED.push(k); await act(k, 'Deny', 1500); let call = null; for (let i = 0; i < 30 && !call; i++) { await sleep(1000); call = c.calls.filter(x => x.fn === 'portal' && /"op":"reject"/.test(x.b) && x.b.indexOf(k.slice(4, 40)) > -1).pop(); } const gone = await ev(k => !__row(k), k); return { ok: gone && call && call.status === 200, k, note: 'deny never asks why — the reason only goes in through 📝 Note' }; });
const DENIED = (USED[2] || '').replace(/^ap2:/, '');
let ASSIGNED = AP.assign[0]; USED.push(ASSIGNED);
await step('📋 Approvals: assign a lead (picker → person)', 2, async () => { await act(ASSIGNED, 'Assign', 1200); const r = await ev(() => __clickText('Glenn Miller', document.getElementById('gcl-asgpick'))); await sleep(3000); const gone = await ev(k => !__row(k), ASSIGNED); const n = c.calls.filter(x => /bid-inbox\?notify/.test(x.fn + x.q)).pop(); return { ok: r && gone && n && n.status === 200 }; });
await step('📋 Approvals: 📝 note on a card', 3, async () => ev(async (k) => { const r0 = __row(k); [...r0.querySelectorAll('button')].find(b => /Note/.test(b.innerText)).click(); await new Promise(z => setTimeout(z, 800)); const r = __row(k); const i = [...r.querySelectorAll('input')].filter(__vis).find(e => /Checked/.test(e.placeholder || '')); __setV(i, 'Called the customer (test)'); [...r.querySelectorAll('button')].find(b => /Save note/.test(b.innerText)).click(); await new Promise(z => setTimeout(z, 1500)); return { ok: /Called the customer \(test\)/.test(__row(k).innerText) && /Note saved/.test(__toasts()) }; }, AP.all.find(k => !USED.includes(k) && /^ap2:/.test(k))));
await step('📋 Approvals: ☐ Select all routine / Approve selected', 1, async () => ev(() => { const b = [...document.querySelectorAll('main button')].filter(__vis).find(x => /Select all routine/.test(x.innerText)); return { ok: !!b, note: b ? b.innerText.trim() + ' — nothing routine waiting in this data, so the bulk approve could not run' : '' }; }));
await step('📋 Approvals: after a reload, the assigned lead and the denied item stay gone', 1, async () => { await p().reload(); await waitFor(c, () => !!(window._crm && window._crm.projects && window._crm.projects.length && window._setView), null, 120000, 500); await sleep(6000); await p().evaluate(H_JS);
  const r = await ev(async ks => { await __go('approvals'); __clickText('^\\d+\\s+All$'); await new Promise(z => setTimeout(z, 1500)); return ks.map(k => !!__row(k)); }, [ASSIGNED, 'ap2:' + DENIED]); return { ok: !r[0] && !r[1], note: 'assignfix (claude/assignfix) also covers this on live' }; });

/* 3. invoices */
await step('💵 New client invoice: project → amount → due → description → Save', 6, async () => ev(async () => { await __go('invoices'); __clickText('^Client Invoices'); await new Promise(z => setTimeout(z, 800)); __clickText('^\\+ New Invoice$'); await new Promise(z => setTimeout(z, 1200));
  const box = [...document.querySelectorAll('div')].filter(__vis).find(d => /^New Client Invoice/.test(d.innerText || '') && d.querySelector('select')); const ins = [...box.querySelectorAll('input')]; __setV(box.querySelector('select'), box.querySelector('select').options[2].value); await new Promise(z => setTimeout(z, 400));
  __setV(ins.find(i => i.type === 'number'), '1234.50'); __setV(ins.find(i => i.type === 'date'), '2026-11-15'); const tx = ins.filter(i => i.type === 'text'); __setV(tx[tx.length - 1], 'OFFICEDAY client invoice'); const n0 = window._crm.invoices.length;
  [...box.querySelectorAll('button')].find(b => b.innerText.trim() === 'Save').click(); await new Promise(z => setTimeout(z, 2000)); return { ok: window._crm.invoices.length === n0 + 1 && window._crm.invoices.some(i => /OFFICEDAY client invoice/.test(i.desc || '')) }; }));
await step('💵 Dropdowns open in FRONT of the window (PO / project autocomplete, typed in the box that opens with the cursor)', 2, async () => {
  await ev(async () => { __clickText('^\\+ New Invoice$'); await new Promise(z => setTimeout(z, 1200)); const inp = [...document.querySelectorAll('input')].filter(__vis).find(i => /auto-fill/i.test(i.placeholder || '')); inp.setAttribute('data-ofx', '1'); });
  await p().locator('input[data-ofx="1"]').click(); await p().keyboard.type('Zoo', { delay: 40 }); await sleep(1200);
  const r = await ev(() => { const l = [...document.querySelectorAll('._ac-list')].filter(__vis)[0]; if (!l) return { ok: false, note: 'no list opened' }; const b = l.getBoundingClientRect(); const pts = [[b.left + 8, b.top + 8], [b.left + b.width / 2, b.top + b.height / 2]].map(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && l.contains(e)); }); return { ok: pts.every(Boolean), note: pts.every(Boolean) ? 'in front; narrow (the client name is cut off)' : 'the list is behind the window' }; });
  await ev(() => __clickText('^Cancel$')); return r;
});
await step('💵 📎 Upload Invoice: a SUPPLIER bill (Farrell Calhoun) with the file attached → saved', 5, async () => ev(async () => {
  const ce = document.createElement.bind(document); let cap = null; document.createElement = function(t){ const e = ce(t); if (String(t).toLowerCase() === 'input') { cap = e; e.click = function(){}; } return e; }; window._gcSmartInvoiceUpload(); document.createElement = ce;
  const f = new File(['%PDF-1.4\n% Farrell Calhoun INVOICE 55123 Total $812.40\n%%EOF'], 'Farrell-Calhoun-INV-55123.pdf', { type: 'application/pdf' }); const dt = new DataTransfer(); dt.items.add(f); cap.files = dt.files; cap.dispatchEvent(new Event('change')); await new Promise(z => setTimeout(z, 4000));
  const ov = document.getElementById('_gcInvReview'); if (!ov) return { ok: false, note: 'no review window' }; const sels = [...ov.querySelectorAll('select')]; const lab = [...ov.querySelectorAll('*')].filter(e => e.children.length === 0 && /SUBCONTRACTOR/i.test(e.textContent)).length;
  const guess = sels[0].options[sels[0].selectedIndex].text; __setV(sels[1], [...sels[1].options].find(o => /Zoo Boardwalk/.test(o.text)).value); const vis = [...ov.querySelectorAll('input')].filter(__vis); __setV(vis[0], '812.40'); __setV(vis.find(i => i.type === 'date'), '2026-10-28'); __setV(vis[2], '55123');
  [...ov.querySelectorAll('button')].find(b => /Save these/.test(b.innerText)).click(); await new Promise(z => setTimeout(z, 2500)); const iv = window._crm.invoices.find(i => i.invNum === '55123' || /55123/.test(i.invNum || ''));
  return { ok: !!(iv && iv.fileData), note: 'guessed "' + guess + '"; the box is labelled SUBCONTRACTOR (no supplier choice); saved as a sub invoice' + (iv ? ' (' + iv.type + ')' : '') };
}));
await step('💵 Sub Invoices: approve the supplier bill (no COI / W-9 stop for a supplier)', 2, async () => ev(async () => { __clickText('^Sub Invoices'); await new Promise(z => setTimeout(z, 1500)); const r = [...document.querySelectorAll('main tr')].filter(__vis).find(x => /Calhoun/.test(x.innerText)); const warn = /not in your sub list/.test(r.innerText);
  [...r.querySelectorAll('button')].find(b => /Approve/.test(b.innerText)).click(); await new Promise(z => setTimeout(z, 2500)); const iv = window._crm.invoices.find(i => /55123/.test(i.invNum || '')); const stop = !!document.getElementById('gc-a6-ov');
  return { ok: iv && iv.status === 'approved' && !stop, note: warn ? 'the row says "Ferrel Calhoun is not in your sub list — pick the right one" right after the upload picked that name' : '' }; }));
await step('💵 📥 Needs a job (money mail without a job)', 1, async () => ev(async () => { await __go('todo'); const b = [...document.querySelectorAll('#gc-money-needs button')].filter(__vis).map(x => x.innerText.trim()); return { ok: b.some(t => /Import card statement/.test(t)), note: b.some(t => /Needs a job/.test(t)) ? 'shown' : 'no unmatched money mail in this data — the button only shows when there is some' }; }));

/* 4. office desk */
await step('📬 Collections: send a payment reminder', 2, async () => ev(async () => { window._gcOpenCollectionsDesk(); await new Promise(z => setTimeout(z, 2500)); const P = new Set(window._crm.projects.map(p => p.id)); const ov = document.getElementById('gcoff-coll-ov');
  const btns = [...ov.querySelectorAll('[data-offrem]')].filter(__vis); const good = btns.find(b => { const iv = window._crm.invoices.find(i => i.id === b.getAttribute('data-offrem')); return iv && P.has(iv.pid); }); good.scrollIntoView({ block: 'center' }); good.click(); await new Promise(z => setTimeout(z, 2500)); const t = __toasts();
  const orphan = btns.find(b => { const iv = window._crm.invoices.find(i => i.id === b.getAttribute('data-offrem')); return iv && !P.has(iv.pid); }); let t2 = ''; if (orphan) { orphan.click(); await new Promise(z => setTimeout(z, 2500)); t2 = __toasts(); }
  ov.remove(); return { ok: /on ✅ Approvals/.test(t), expect: ['office-board'], note: orphan ? 'an invoice whose job was deleted says only: "' + t2.slice(0, 60) + '"' : '' }; }));
await step('🛡 Sub paperwork: Request docs (one request on Approvals)', 2, async () => ev(async () => { window._gcOpenSubCompliance(); await new Promise(z => setTimeout(z, 2000)); const b = [...document.querySelectorAll('button[data-req]')].filter(__vis)[0]; b.click(); await new Promise(z => setTimeout(z, 3000)); const t = __toasts(); document.querySelectorAll('body > div').forEach(d => { if (d.querySelector('button[data-req]')) d.remove(); }); return { ok: /on ✅ Approvals/.test(t), note: 'three different doors: Office card → table with Edit only; this panel → Request docs; To-Do "Send all" → one mail window per sub' }; }));
await step('⚖️ Liens & waivers (job → 🧰 Job tools)', 3, async () => ev(async () => { window._navToJob('PRJqwpno4m'); await new Promise(z => setTimeout(z, 3000)); const b = document.querySelector('[data-offjob="liens"]'); if (!b) return { ok: false, note: 'no Liens button' }; b.click(); await new Promise(z => setTimeout(z, 2500)); const ov = document.getElementById('gcoff-job-ov'); const reel = [...document.querySelectorAll('body *')].filter(__vis).some(e => e.children.length === 0 && /Before\/after reel kit/.test(e.textContent || '')); const ok = !!ov && /Lien waivers, per payment/.test(ov.innerText) && !reel; ov && ov.remove(); return { ok, note: (reel ? 'ALSO opened the 🎬 reel kit page; ' : '') + 'per job only — no office-wide list' }; }));
await step('✍️ Unsigned change orders (job → 🧰 Job tools)', 1, async () => ev(async () => { document.querySelector('[data-offjob="cos"]').click(); await new Promise(z => setTimeout(z, 2500)); const ov = document.getElementById('gcoff-job-ov'); const reel = [...document.querySelectorAll('body *')].filter(__vis).some(e => e.children.length === 0 && /Before\/after reel kit/.test(e.textContent || '')); const ok = !!ov && /Unsigned change orders/.test(ov.innerText) && !reel; ov && ov.remove(); return { ok, note: (reel ? 'ALSO opened the 🎬 reel kit page; ' : '') + 'per job only — no office-wide list' }; }));

/* 5. messages / mail */
await step('💬 Messages: file an unsorted text under its job', 3, async () => ev(async () => { await __go('messages'); const m = document.querySelector('main'); const n0 = (m.innerText.match(/Unsorted — pick a job \((\d+)\)/) || [])[1]; const sel = [...m.querySelectorAll('select')].filter(__vis)[0]; __setV(sel, [...sel.options].find(o => /A001/.test(o.text)).value); [...m.querySelectorAll('button')].filter(__vis).find(b => b.innerText.trim() === 'Move').click(); await new Promise(z => setTimeout(z, 2000)); const n1 = (m.innerText.match(/Unsorted — pick a job \((\d+)\)/) || [])[1]; return { ok: +n1 === +n0 - 1 || (n0 && !n1), note: 'no "moved" message — the card just disappears' }; }));
await step('💬 Messages: post on a job thread (@-tag)', 3, async () => ev(async () => { const j = [...document.querySelectorAll('main button')].filter(__vis).find(b => /^PO A001/.test(b.innerText.trim())); j.click(); await new Promise(z => setTimeout(z, 2000)); const ta = [...document.querySelectorAll('textarea')].filter(__vis).find(e => /Message the team/.test(e.placeholder || '')); __setV(ta, 'Office day test — customer called about the start date'); [...document.querySelectorAll('button')].filter(__vis).find(b => b.innerText.trim() === 'Send').click(); await new Promise(z => setTimeout(z, 2000)); const ok = [...document.querySelectorAll('*')].some(e => e.children.length === 0 && /Office day test — customer called/.test(e.textContent)); __clickText('^Close$'); return { ok }; }));
await step('📧 Mail: the e-mail center opens (each mailbox opens Gmail)', 1, async () => ev(async () => { await __go('gmail'); const t = document.querySelector('main').innerText; return { ok: /GrayCo Email Center/.test(t) && /office@\s+mailbox/.test(t) && /Open office@grayco-cs\.com/.test(t), note: 'the red "For you to approve" escalation banner sits over the page header' }; }));

/* 6. customers */
await step('👥 Customers: add a customer', 6, async () => ev(async () => { await __go('customers'); __clickText('^\\+ New Customer$'); await new Promise(z => setTimeout(z, 1000)); const set = (ph, v) => __setV([...document.querySelectorAll('input')].filter(__vis).find(i => i.placeholder === ph), v);
  set('Full name or company', 'Officeday Testcustomer'); set('901-555-0000', '901-555-0199'); set('client@email.com', 'officeday.test@example.invalid'); __clickText('Save Customer'); await new Promise(z => setTimeout(z, 2000)); const s = [...document.querySelectorAll('input')].filter(__vis).find(i => /Search by name/.test(i.placeholder || '')); __setV(s, 'Officeday'); await new Promise(z => setTimeout(z, 1000)); return { ok: document.querySelector('main').innerText.includes('Officeday Testcustomer') }; }));
await step('👥 Customers: edit the phone', 3, async () => ev(async () => { const row = [...document.querySelectorAll('main tr')].filter(__vis).find(r => /Officeday Testcustomer/.test(r.innerText)); [...row.querySelectorAll('button')].find(b => /✏️|Edit/.test(b.innerText)).click(); await new Promise(z => setTimeout(z, 1200)); __setV([...document.querySelectorAll('input')].filter(__vis).find(i => i.value === '901-555-0199'), '901-555-0222'); __clickText('Save Customer'); await new Promise(z => setTimeout(z, 1500)); return { ok: /901-555-0222|\(901\) 555-0222/.test(document.querySelector('main').innerText) }; }));

/* 7. leads */
await step('◈ Leads: add a lead (PM picked after the workload hint shows)', 6, async () => ev(async () => { await __go('leads'); __clickText('＋ New lead'); await new Promise(z => setTimeout(z, 4500));   /* the 2.5 s workload hint has run */
  const box = [...document.querySelectorAll('main div')].filter(__vis).find(d => /^Add New/.test((d.innerText || '').trim()) && d.querySelector('textarea')); const ins = [...box.querySelectorAll('input')], sels = [...box.querySelectorAll('select')];
  __setV(ins[0], 'Officeday Testlead'); __setV(ins[1], '901-555-0333'); __setV(sels[0], [...sels[0].options].find(o => /Website/.test(o.text)).value); const due = sels.find(s => [...s.options].some(o => /Unknown yet/.test(o.text))); __setV(due, [...due.options].find(o => /Unknown yet/.test(o.text)).value);
  const pm = sels.find(s => [...s.options].some(o => /Nick Thomas/.test(o.text))); const opt = [...pm.options].find(o => /Nick Thomas/.test(o.text)); const hinted = opt.text; __setV(pm, opt.value); [...box.querySelectorAll('button')].find(b => b.innerText.trim() === 'Save').click(); await new Promise(z => setTimeout(z, 2500));
  const L = window._crm.leads.find(l => /Officeday Testlead/.test(l.name || '')); return { ok: !!L && L.pm === 'Nick Thomas', note: 'option read "' + hinted.slice(0, 50) + '", saved pm "' + (L && L.pm) + '"; the form opens below the whole list; "or tick Unknown yet" is a dropdown, not a tick' }; }));
await step('◈ Leads: assign it (row → picker → person)', 2, async () => ev(async () => { const row = [...document.querySelectorAll('main tr')].filter(__vis).find(r => /Officeday Testlead/.test(r.innerText)); [...row.querySelectorAll('button')].find(x => /Nick Thomas/.test(x.innerText)).click(); await new Promise(z => setTimeout(z, 1000)); __clickText('Steven Biffle', document.getElementById('gcl-asgpick')); await new Promise(z => setTimeout(z, 2000)); const L = window._crm.leads.find(l => /Officeday Testlead/.test(l.name || '')); return { ok: /Steven Biffle/.test(L.pm), note: /Assigned to/.test(__toasts()) ? '' : 'no toast' }; }));
await step('◈ Leads: delete, then ↩ Undo', 3, async () => ev(async () => { const row = [...document.querySelectorAll('main tr')].filter(__vis).find(r => /Officeday Testlead/.test(r.innerText)); [...row.querySelectorAll('button')].find(x => /🗑/.test(x.innerText)).click(); await new Promise(z => setTimeout(z, 800)); __clickText('^🗑 Delete$'); await new Promise(z => setTimeout(z, 700));
  const gone = !window._crm.leads.some(l => /Officeday Testlead/.test(l.name || '')); __clickText('^Undo$'); await new Promise(z => setTimeout(z, 2000)); const back = window._crm.leads.some(l => /Officeday Testlead/.test(l.name || '') && !l.deleted); return { ok: gone && back }; }));

/* 8–10 */
await step('✅ Office To-Do: the 🧹 Nightly data check is under ⚙️ Setup & admin and opens its list', 3, async () => ev(async () => { await __go('todo'); const f = window._gcTD2.find('Nightly data check')[0]; if (!f) return { ok: false, note: 'no data-check item' }; const cat = f.cat; const ov = window._gcOpenDataCheck(); await new Promise(z => setTimeout(z, 1500)); const ok = cat === 'setup' && !!ov && /Nightly data check/.test(ov.innerText); if (ov && ov.remove) ov.remove(); return { ok, note: 'category ' + cat }; }));
await step('✅ To-Do buttons (💳 / 🏦 import) leave with the To-Do list and come back', 4, async () => ev(async () => { const shown = () => [...document.querySelectorAll('button')].filter(__vis).some(b => /Import card statement/.test(b.innerText)); const r = {}; for (const v of ['forms', 'dashboard', 'leads', 'todo']) { window._setView(v); await new Promise(z => setTimeout(z, 3200)); r[v] = shown(); } return { ok: !r.forms && !r.dashboard && !r.leads && r.todo, note: JSON.stringify(r) }; }));
await step('📅 Schedule view', 1, async () => ev(async () => { const t0 = performance.now(); window._setView('schedule'); let ok = false; for (let i = 0; i < 40 && !ok; i++) { await new Promise(z => setTimeout(z, 100)); const m = document.querySelector('main'); ok = !!m && /Schedule/.test(m.innerText.slice(0, 200)) && m.querySelectorAll('button').length > 5; } const ms = Math.round(performance.now() - t0); await new Promise(z => setTimeout(z, 800)); const t = document.querySelector('main').innerText; return { ok: ok && ms < 1000, note: 'drawn in ' + ms + ' ms; opens on "My Schedule" — ' + ((t.match(/(\d+) items in/) || [])[0] || '') + ' for the office until she picks "Active Company"' }; }));
await step('🖨 Print / PDF: an invoice (there is no customer statement)', 2, async () => ev(async () => { window.__OPENED.length = 0; await __go('invoices'); __clickText('^Client Invoices'); await new Promise(z => setTimeout(z, 800)); let b = null; for (let i = 0; i < 20 && !b; i++) { b = [...document.querySelectorAll('main button')].filter(__vis).find(x => x.innerText.trim() === '🖨'); if (!b) await new Promise(z => setTimeout(z, 500)); } if (!b) return { ok: false, note: 'no 🖨 button' }; b.click(); await new Promise(z => setTimeout(z, 2500)); return { ok: window.__OPENED.length > 0, note: 'opens the print window; a statement of all open invoices for one customer does not exist' }; }));

/* the whole day */
const errs = c.errs.filter(e => !/ResizeObserver|Failed to load resource|net::ERR|AbortError/i.test(e)); if (errs.length) { fails++; console.log('FAIL page errors ' + JSON.stringify(errs.slice(0, 5))); } else console.log('ok   no page errors');
const rep = {}; let worst = null; for (const x of c.calls) { const k = x.m + ' ' + x.fn + x.q + ' ' + x.b; (rep[k] = rep[k] || []).push(x.t); } for (const k of Object.keys(rep)) { const ts = rep[k]; for (let i = 0; i + 3 < ts.length; i++) if (ts[i + 3] - ts[i] < 60000 && !/notify-docs/.test(k)) { worst = worst || [k.slice(0, 120), ts.length]; break; } }
if (worst) { fails++; console.log('FAIL a request repeated more than 3 times in a minute ' + JSON.stringify(worst)); } else console.log('ok   no request repeated more than 3 times in a minute (notify-docs aside)');
if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'officeday.json'), JSON.stringify(RESULTS, null, 1));
console.log('\n| # | Task | Works | Clicks | Time | Notes |\n|---|---|---|---|---|---|');
for (const r of RESULTS) console.log('| ' + r.n + ' | ' + r.name + ' | ' + (r.ok ? 'yes' : 'NO') + ' | ' + r.clicks + ' | ' + (r.ms / 1000).toFixed(1) + ' s | ' + (r.note || '').replace(/\|/g, '/') + (r.bad.length ? ' BAD: ' + r.bad.join('; ') : '') + ' |');
console.log(fails ? '\nOFFICEDAY: FAIL (' + fails + ')' : '\nOFFICEDAY: PASS');
await c.b.close(); process.exit(fails ? 1 : 0);
