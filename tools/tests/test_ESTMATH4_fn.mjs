// test_ESTMATH4_fn.mjs [build-dir] — patch ESTMATH4, offline (node, no browser): the Mississippi contractor's tax is
// charged ONCE, and only on MS jobs, on every customer document. Runs the page's own code cut out of index.html in a VM:
// the Estimate Builder script (stand-in page), the GrayCo-format proposal (used by Save & Create Proposal, Generate
// Proposal, 📄 Send estimate / the PDF and the portal), the Word proposal and the contract's price section.
//   1. an MS sample job from the builder: proposal total = the builder's grand total, exactly; the 3.5% appears once
//      ("Includes ... 3.5%"), no extra "Ms contractors tax" line — through both builder buttons and from the saved record;
//   2. a TN job: no MS tax anywhere, total = builder total;
//   3. an estimate whose prices do NOT carry the tax (uploaded proposal / flagged after the fact): the tax is added once;
//   4. the Word proposal: the same rule; 5. the contract: an MS contract price is not raised by 3.5% again.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const BUILD = path.resolve(process.argv[2] || '.');
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8'), H = html.split('\n');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };
const scriptAround = marker => { const i = H.findIndex(l => l.includes(marker)); if (i < 0) throw new Error('not found: ' + marker); let a = i; while (!/<script[ >]/.test(H[a])) a--; let b = i; while (!/<\/script>/.test(H[b])) b++; return H.slice(a + 1, b).join('\n'); };
const BUILDER = scriptAround('// ─── STATE ─'), PROPOSAL = scriptAround('GrayCo Proposal Generator - matches'), WORD = scriptAround('window._gcEstimateToWord = function');
const ci = H.findIndex(l => l.includes("var _st=String((j.state||j.address||'')).toUpperCase();")); let ce = ci; while (!/^      \}\)\(\),?$/.test(H[ce])) ce++;
const CONTRACT = H.slice(ci - 1, ce + 1).join('\n').replace(/,\s*$/, '');

/* one VM: the builder (stand-in page) + the proposal + the Word export */
const timers = [], els = new Map(), docs = [];
const El = id => ({ id, value: '', checked: false, style: {}, dataset: {}, innerHTML: '', textContent: '', options: [], children: [], parentNode: { insertBefore(){}, appendChild(){}, removeChild(){} },
  classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } }, appendChild(){}, removeChild(){}, insertBefore(){}, remove(){}, addEventListener(){}, setAttribute(){}, getAttribute(){ return null; },
  querySelector(){ return null; }, querySelectorAll(){ return []; }, closest(){ return null; }, contains(){ return false; }, focus(){}, click(){}, getBoundingClientRect(){ return {}; } });
const qel = id => { if (!els.has(id)) els.set(id, El(id)); return els.get(id); };
const ctx = { console: { log(){}, warn(){}, error(){}, info(){} }, navigator: { userAgent: 'node' }, location: { hash: '', href: 'x', search: '' },
  document: { getElementById: qel, querySelector(){ return null; }, querySelectorAll(){ return []; }, createElement(){ return El(''); }, body: El('body'), head: El('head'), documentElement: El('html'), addEventListener(){}, activeElement: null, readyState: 'complete' },
  localStorage: { getItem: () => null, setItem(){}, removeItem(){} }, setTimeout: f => { timers.push(f); return 1; }, clearTimeout(){}, setInterval: () => 0, clearInterval(){}, requestAnimationFrame: () => 0,
  alert(){}, confirm: () => false, prompt: () => null, fetch: () => new Promise(() => {}), Event: class {}, CustomEvent: class {}, MutationObserver: class { observe(){} disconnect(){} },
  Blob: class { constructor(p){ docs.push(String(p.join(''))); } }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL(){} },
  performance: { now: () => Date.now() }, addEventListener(){}, removeEventListener(){}, matchMedia: () => ({ matches: false, addListener(){} }), getComputedStyle: () => ({}) };
ctx.window = ctx; ctx.self = ctx; ctx.storage = { get: async () => null, set: async () => true }; ctx._crm = { projects: [], estimates: [] };
vm.createContext(ctx);
for (const [n, src] of [['builder', BUILDER], ['proposal', PROPOSAL], ['word', WORD]]) { try { vm.runInContext(src, ctx, { filename: n + '.js' }); } catch (e) { /* page-only start-up */ } }
timers.length = 0;
const R = s => vm.runInContext(s, ctx);
const money = n => (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const totalOf = h => { const m = h.match(/The total amount of this Proposal is: \$([\d,]+\.\d\d)/); return m ? m[1] : null; };
const count = (h, re) => (h.match(re) || []).length;
const LINES = [{ id: 'A', desc: 'Framing sub', qty: 1, cost: 120000, type: 'sub', cat: 'Framing', mult: 'type' },
  { id: 'B', desc: 'Hang labor', qty: 900, cost: 28, type: 'labor', cat: 'Drywall', mult: '1.6' },
  { id: 'C', desc: 'Drywall [5/8" Type X] 4×12 (48 SF) — All', qty: 900, cost: 23.04, type: 'material', cat: 'Drywall', unit: 'sheet', mult: 'type' },
  { id: 'D', desc: 'Finisher', qty: 40, cost: 44.44, type: 'mh', cat: 'Drywall', mult: 'type' }];
/* set the builder up as a job in a state, then press its proposal buttons; capture what the proposal is given */
function job(state, address){
  ctx.__L = JSON.parse(JSON.stringify(LINES));
  R(`settings.jobState=${JSON.stringify(state)}; settings.tax=9.75; settings.msContractorTax=3.5; jobMult=1.3; useOvr=false; lines=__L; openSlots[activeSlot].lines=[...lines];
     qs('ej-name').value='Sample ${state} job'; qs('ej-address').value=${JSON.stringify(address)}; qs('ej-state').value=${JSON.stringify(state)};`);
  const builderTotal = R('lines.reduce((s,l)=>s+lineCharge(l),0)');
  const got = {};
  R(`window.__cap=[]; window._gcOpenGrayCoProposal=function(e){ window.__cap.push(e); }; window._gcProposalToPdf=function(){}; window._gcSaveMasterScope=function(){}; saveSlotState=function(){};`);
  R('window._gcGenerateMyProposal(); gcMakeProposal();');
  const [e1, e2] = R('window.__cap');
  got.gen = R('window._gcBuildGrayCoProposal')(e1); got.make = R('window._gcBuildGrayCoProposal')(e2);
  /* the saved record (what Send estimate / the PDF / the portal print) */
  ctx.__rec = { id: 'S1', name: 'Sample ' + state + ' job', address, settings: { tax: 9.75, jobState: state, msContractorTax: 3.5 }, jobMult: 1.3, lines: JSON.parse(JSON.stringify(LINES)), totalCharge: builderTotal };
  got.saved = R('window._gcBuildGrayCoProposal(__rec)');
  docs.length = 0; R('window._gcEstimateToWord(__rec)'); got.word = docs[0] || '';
  docs.length = 0; R('window._gcEstimateToWord(__cap[1])'); got.word2 = docs[0] || '';
  return { builderTotal, ...got };
}

/* 1. MS */
const ms = job('MS', '100 Goodman Rd, Olive Branch, Ms.');
const msIncl = LINES.filter(l => l.type !== 'mh').reduce((a, l) => a + R('lineCharge')(l), 0) * 0.035 / 1.035;
console.log('   MS sample job: builder total $' + money(ms.builderTotal) + ' (MS tax inside the lines $' + money(msIncl) + ')');
for (const [k, h] of [['Save & Create Proposal', ms.gen], ['Generate Proposal (gcMakeProposal)', ms.make], ['the saved estimate (Send estimate / PDF / portal)', ms.saved]]) {
  const tot = totalOf(h);
  ok(tot === money(ms.builderTotal) && count(h, /3\.5%/g) === 1 && /Includes the Mississippi contractor’s tax \(3\.5%\): \$/.test(h) && !/Ms contractors tax|Total with contractors tax/.test(h),
    'MS, ' + k + ': proposal total $' + tot + ' = builder total, the 3.5% shown once (included), no extra tax line', { tot, n35: count(h, /3\.5%/g), tail: h.slice(h.indexOf('The total amount')).replace(/<[^>]+>/g, ' ').slice(0, 260) });
}
ok(ms.saved.includes('$' + money(msIncl)), 'the "included" figure is the 3.5% inside the priced lines ($' + money(msIncl) + '; man-hours carry none)');

/* 2. TN */
const tn = job('TN', '100 Main St, Memphis, TN 38103');
for (const [k, h] of [['Save & Create Proposal', tn.gen], ['Generate Proposal', tn.make], ['the saved estimate', tn.saved]]) {
  ok(totalOf(h) === money(tn.builderTotal) && !/3\.5%|contractor’?'?s tax|contractors tax/i.test(h), 'TN, ' + k + ': total $' + totalOf(h) + ' = builder total, no MS tax anywhere');
}
ok(Math.abs(ms.builderTotal / tn.builderTotal - (1 + 0.035 * (1 - (40 * 75) / tn.builderTotal))) < 1e-9 || ms.builderTotal > tn.builderTotal, 'the builder itself charges the MS job its 3.5% (MS $' + money(ms.builderTotal) + ' vs TN $' + money(tn.builderTotal) + ')');

/* 3. prices that do NOT carry the tax: added once */
const up = R(`window._gcBuildGrayCoProposal({ name: 'Uploaded', address: 'Oxford, Ms.', jobState: 'MS', _msTaxApplied: true, lines: [{ desc: 'Scope', cat: 'General', charge: 30773.12 }], totalCharge: 30773.12 })`);
ok(totalOf(up) === '30,773.12' && /Ms contractors tax \(3\.5%\) = \$1,077\.06/.test(up) && /Total with contractors tax = \$31,850\.18/.test(up) && count(up, /3\.5%/g) === 1, 'prices without the tax (an uploaded proposal): the 3.5% is added once — $30,773.12 + $1,077.06 = $31,850.18');
const fl = R(`window._gcBuildGrayCoProposal({ name: 'Flagged', address: 'Horn Lake, Ms.', settings: { jobState: 'MS' }, _msTaxApplied: true, lines: [{ desc: 'x', cat: 'General', charge: 1000 }], totalCharge: 1000 })`);
ok(/Total with contractors tax = \$1,035\.00/.test(fl), 'an estimate the MS check flagged after it was priced: tax added once ($1,035.00)');

/* 4. the Word proposal */
const wTot = h => { const m = h.match(/Total for this project = ([\d,]+\.\d\d)/); return m && m[1]; };
ok(wTot(ms.word) === money(ms.builderTotal) && wTot(ms.word2) === money(ms.builderTotal) && !/Ms contractors tax|Total with contractors tax/.test(ms.word + ms.word2) && /Includes the Mississippi contractor’s tax \(3\.5%\)/.test(ms.word),
  'Word proposal, MS: total $' + wTot(ms.word) + ' = builder total, tax shown once (included)', ms.word.slice(ms.word.indexOf('Total for this')).replace(/<[^>]+>/g, ' ').slice(0, 200));
ok(wTot(tn.word) === money(tn.builderTotal) && !/contractor/i.test(tn.word.replace(/GrayCo Construction Services, LLC will furnish[^<]*/, '')), 'Word proposal, TN: no MS tax');

/* 5. the contract's price section */
const contract = (j) => { const c = { j, fmt$: n => '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }; vm.createContext(c); return vm.runInContext(CONTRACT, c); };
const k1 = contract({ state: 'MS', address: 'Olive Branch, Ms.', contract: 100000, type: 'Commercial' });
ok(/Total Contract Price \(contractor's tax included\)<\/b><\/td><td[^>]*>\$100,000\.00/.test(k1) && /\$3,381\.64/.test(k1) && !/103,500/.test(k1), 'contract, MS commercial $100,000: total stays $100,000.00 with $3,381.64 tax included (was $103,500.00)', k1.replace(/<[^>]+>/g, ' ').slice(0, 300));
const k2 = contract({ state: 'TN', address: 'Memphis, TN', contract: 100000, type: 'Commercial' });
ok(!/contractor's tax/i.test(k2) && !/3\.5%/.test(k2), 'contract, TN: no MS tax', k2.slice(0, 200));
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
