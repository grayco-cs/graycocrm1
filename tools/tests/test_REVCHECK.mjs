// test_REVCHECK.mjs <build-dir> — patch REVCHECK (owner 11/24: "saw 1.6 million on this earlier … make sure that's always good"). Real data:
// the company snapshot GC_SNAP (11/19 — BEFORE the 11/20 QuickBooks-only cleanup, so it still holds the CRM copies of QuickBooks invoices).
// The owner on the desk computer, Company view: under Revenue (billed) a line "QuickBooks $X · CRM-only $Y" whose two parts add up to the
// tile's number, and the amber ⚠ for CRM invoices that look like copies of QuickBooks ones. Nothing is written anywhere.
import path from 'path'; import fs from 'fs'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const SNAP = process.env.GC_SNAP || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/qa/snap/2026-11-19T05-08-16';
const build = process.argv[2];
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
if (!fs.existsSync(path.join(SNAP, 'rows.ndjson'))) { console.log('  (no snapshot — skipped)'); process.exit(0); }
const H = await import(pathToFileURL(HARNESS).href);
const L = await import(pathToFileURL(path.join(HERE, '..', 'qa', 'qa_lib.mjs')).href);
const snap = L.readSnap(SNAP); L.loadIntoHarness(H, snap); const acc = L.accountsFromSnap(H, snap);
const owner = String((acc.map.admin || {}).email || '').toLowerCase();
const money = t => +String(t || '').replace(/[^0-9.]/g, '');
try {
  const d = await H.computer('REVCHECK', { build });
  ok(await H.signIn(d, owner, 120000), 'the owner signs in on the desk computer');
  const got = await H.waitFor(d, () => { const b = document.querySelector('[data-revcheck]'); return b && /QuickBooks \$[1-9]/.test(b.textContent) && ((window._crm && (window._crm.invs || window._crm.invoices)) || []).length > 100 ? 1 : 0; }, null, 180000);
  await H.sleep(5000);
  const r = await d.ev(() => {
    const b = document.querySelector('[data-revcheck]'); if (!b) return null;
    const tile = b.parentElement, lab = [...tile.querySelectorAll('div,span')].find(e => /^revenue \(billed\)$/i.test(e.textContent.trim()));
    const val = [...tile.children].map(e => e.textContent.trim()).find(t => /^\$[\d,]+\.\d\d$/.test(t));
    return { line: b.textContent, title: b.title, color: b.style.color, val, lab: !!lab, calc: window._gcRevCheck ? window._gcRevCheck(2026) : null };
  });
  console.log('    tile: ' + (r && r.val) + ' · line: ' + (r && r.line));
  ok(!!got && r && r.lab, 'the line sits under Revenue (billed) on the Company dashboard', r);
  const m = /QuickBooks \$([\d,]+)(?: · CRM-only \$([\d,]+))?/.exec(r && r.line || '');
  const parts = m ? money(m[1]) + (m[2] ? money(m[2]) : 0) : -1;
  ok(m && Math.abs(parts - money(r.val)) <= 2, 'QuickBooks + CRM-only add up to the tile (' + parts + ' vs ' + (r && r.val) + ')', r);
  ok(r && r.calc && r.calc.copies.length > 0 && /^⚠/.test(r.line) && /look like a copy/.test(r.line), 'the 11/19 data (before the cleanup) → amber ⚠ "CRM invoices look like a copy of a QuickBooks one", listed on hover', r && { line: r.line, title: r.title });
  const errs = await d.ev(() => (window.__gcErrs || []).length).catch(() => 0);
  ok(!errs, 'no page errors', errs);
} catch (e) { ok(false, 'threw: ' + String(e && e.message).slice(0, 200)); }
console.log(`\nREVCHECK ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
