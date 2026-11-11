// "CRM prices" window: link PlanBuilder products (and Studio's unit rates) to the prices in the GrayCo CRM.
// Never shown in customer view.
import { loadCRM, applyCRM, resolveLink, suggest, autoLink, unitFactor, crmSystemRates, marginToMarkup } from './crm.js';
import { RATE_LIST, setCrmRates } from './systems.js';
import { CATEGORIES, categoryName } from './catalog.js';
import * as store from './store.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => (v == null || !isFinite(v) ? '—' : '$' + (+v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const SYS_UNITS = Object.fromEntries(RATE_LIST.map(([k, , u]) => [k, u]));

export function installCRM(app) {
  app.crm = null;
  let lastSync = 0;
  const sysLinks = () => store.pref('crm.sysLinks', {});

  // Read the CRM, put its prices on linked products and Studio rates. Returns the applyCRM result.
  app.crmSync = async (quiet = false) => {
    lastSync = Date.now();
    const crm = await loadCRM();
    app.crm = crm;
    if (!crm.found) return { changed: [], problems: [], found: false };
    const r = applyCRM(app.catalog, crm);
    setCrmRates(crmSystemRates(sysLinks(), crm, SYS_UNITS));
    if (r.changed.length) store.saveCatalog(app.catalog);
    if (r.changed.length || !quiet) { app.renderPicker && app.renderPicker(); app.refresh && app.refresh(); }
    if (quiet && r.changed.length) app.toast(`Prices updated from the CRM: ${r.changed.length} change${r.changed.length > 1 ? 's' : ''}.`);
    return { ...r, found: true };
  };
  // Pick up price changes made in the CRM (another tab) when PlanBuilder comes back into view.
  const again = () => { if (document.visibilityState === 'visible' && Date.now() - lastSync > 30000) app.crmSync(true); };
  document.addEventListener('visibilitychange', again);
  window.addEventListener('focus', again);
  setTimeout(() => app.crmSync(true), 0);

  app.showCRM = async (tab = 'products') => {
    const body = document.createElement('div');
    body.className = 'crm-win price-only';
    body.innerHTML = '<h2>CRM prices</h2><p class="hint">Reading the CRM…</p>';
    app.modal(body);
    await app.crmSync(true);
    const crm = app.crm;
    let showTab = tab;

    // one shared pick list each for material and labor (thousands of rows: keep a single datalist)
    const labelOf = new Map(), keyOf = new Map();
    const label = x => {
      let t = `${x.name} — ${money(x.cost)} ${x.unitText || x.unit} · ${x.from}`;
      if (keyOf.has(t) && keyOf.get(t) !== x.key) t += ` [${x.key}]`;
      return t;
    };
    const lists = { mat: [], lab: [] };
    if (crm.found) crm.sources.forEach(x => {
      const t = label(x); labelOf.set(x.key, t); keyOf.set(t, x.key);
      if (x.kind === 'material' || x.kind === 'sub') lists.mat.push(t);
      if (x.kind === 'labor' || x.kind === 'sub' || x.kind === 'hourly') lists.lab.push(t);
    });

    const draw = () => {
      const s = crm.settings;
      const status = crm.found
        ? `<div class="crm-status ok">✔ Connected to the GrayCo CRM in this browser: <b>${crm.counts.rateBook}</b> Rate Book lines, <b>${crm.counts.products.toLocaleString()}</b> products, <b>${crm.counts.laborRates}</b> labor rates${s && s.tax != null ? `, tax ${s.tax}%` : ''}${s && s.marginPct != null ? `, margin ${s.marginPct}%` : ''}. PlanBuilder only reads the CRM; it never changes it.</div>`
        : `<div class="crm-status warn">No CRM prices were found in this browser. Open PlanBuilder at <b>crm.grayco-cs.com/planbuilder/</b> in the same browser you use for the CRM, open the CRM once (so it loads its Rate Book, Products and Labor Rates), then press Refresh.</div>`;
      const linked = app.catalog.filter(p => p.crm && (p.crm.mat || p.crm.lab)).length;
      body.innerHTML = `<h2>CRM prices</h2>${status}
        <p class="hint">Link each PlanBuilder product to a CRM line for its <b>material</b> price and one for its <b>labor</b> price. Linked prices follow the CRM: when a price changes there, every estimate here uses the new one. ${linked} of ${app.catalog.length} products are linked.</p>
        <div class="row crm-actions">
          <button class="btn" id="crm-refresh">⟳ Refresh from CRM</button>
          <button class="btn" id="crm-auto" ${crm.found ? '' : 'disabled'} title="Links products that have no link yet to their closest CRM line, when the match is clear">✨ Link best matches</button>
          ${s && (s.tax != null || s.marginPct != null) ? `<button class="btn" id="crm-terms">Use CRM tax &amp; margin on this job</button>` : ''}
        </div>
        <div class="tabs crm-tabs"><button data-t="products" class="${showTab === 'products' ? 'on' : ''}">Products</button><button data-t="studio" class="${showTab === 'studio' ? 'on' : ''}">Studio unit rates</button></div>
        <div id="crm-pane"></div>
        <datalist id="crm-mat">${lists.mat.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
        <datalist id="crm-lab">${lists.lab.map(t => `<option value="${esc(t)}">`).join('')}</datalist>`;
      body.querySelector('#crm-refresh').onclick = async () => { await app.crmSync(false); app.showCRM(showTab); };
      const auto = body.querySelector('#crm-auto');
      if (auto) auto.onclick = () => {
        let n = 0;
        app.catalog.forEach(p => {
          if (p.category === 'furniture') return;
          ['mat', 'lab'].forEach(k => {
            if (p.crm && p.crm[k]) return;
            const l = autoLink(p, crm, k);
            if (l) { p.crm = { ...(p.crm || {}), [k]: l }; n++; }
          });
        });
        commit(); app.toast(n ? `Linked ${n} price${n > 1 ? 's' : ''}. Each is marked "check" until you press ✓ (tick "Needs checking" to see them).` : 'No clear matches to link. Link them by hand with ✨ below.');
        draw();
      };
      const terms = body.querySelector('#crm-terms');
      if (terms) terms.onclick = () => {
        const S = app.project.settings, msg = [];
        if (s.tax != null) { S.taxRate = s.tax; msg.push(`tax ${s.tax}%`); }
        if (s.marginPct != null) { S.overheadPct = 0; S.profitPct = marginToMarkup(s.marginPct); msg.push(`${s.marginPct}% margin = ${S.profitPct}% markup (overhead 0%)`); }
        app.commit('CRM tax & margin'); app.toast('This job now uses ' + msg.join(', ') + '.');
      };
      body.querySelectorAll('.crm-tabs button').forEach(b => { b.onclick = () => { showTab = b.dataset.t; draw(); }; });
      if (showTab === 'studio') drawStudio(body.querySelector('#crm-pane')); else drawProducts(body.querySelector('#crm-pane'));
    };

    const commit = () => {
      applyCRM(app.catalog, crm);
      setCrmRates(crmSystemRates(sysLinks(), crm, SYS_UNITS));
      app.saveCat(); app.refresh && app.refresh();
    };

    // the material or labor cell for one link
    const linkCell = (obj, k, unit, onChange) => {
      const link = obj && obj[k];
      const td = document.createElement('td'); td.className = 'crm-link';
      const inp = document.createElement('input');
      inp.setAttribute('list', k === 'mat' ? 'crm-mat' : 'crm-lab');
      inp.placeholder = crm.found ? (k === 'mat' ? 'Search CRM materials…' : 'Search CRM labor…') : 'CRM not connected';
      inp.value = link ? (labelOf.get(link.key) || '⚠ ' + link.key + ' (not in the CRM)') : '';
      inp.disabled = !crm.found;
      inp.onchange = () => {
        const v = inp.value.trim();
        if (!v) return onChange(null);
        const key = keyOf.get(v);
        if (!key) { inp.classList.add('bad'); return; }
        onChange({ key });
      };
      td.append(inp);
      const r = link ? resolveLink(link, crm, unit) : null;
      if (link && r && r.src) {
        const needHrs = r.src.kind === 'hourly', needPer = !needHrs && (!unitFactor(r.src.unit, unit, r.src.name) || link.per);
        if (needHrs || needPer) {
          const n = document.createElement('input'); n.type = 'number'; n.step = 'any'; n.min = '0'; n.className = 'crm-per';
          n.value = needHrs ? (link.hrs ?? '') : (link.per ?? '');
          n.title = needHrs ? `Hours of labor per ${unit}` : `How many CRM units (${r.src.unitText || r.src.unit}) make one ${unit}`;
          n.placeholder = needHrs ? `hr / ${unit}` : `per ${unit}`;
          n.onchange = () => onChange({ ...link, [needHrs ? 'hrs' : 'per']: n.value === '' ? undefined : +n.value });
          const lab = document.createElement('small'); lab.textContent = needHrs ? ` hr per ${unit}` : ` ${r.src.unitText || r.src.unit} per ${unit}`;
          td.append(document.createElement('br'), n, lab);
        }
      }
      if (r) { const m = document.createElement('div'); m.className = 'crm-note' + (r.ok ? '' : ' bad'); m.textContent = r.ok ? `= ${money(r.value)} / ${unit}${r.note ? ' (' + r.note + ')' : ''}` : '⚠ ' + r.note; td.append(m); }
      if (link && link.auto) {
        const c = document.createElement('div'); c.className = 'crm-check';
        c.innerHTML = '<span>Linked automatically: check it</span> ';
        const ok = document.createElement('button'); ok.className = 'btn small'; ok.textContent = '✓ Right'; ok.title = 'This is the right CRM price';
        ok.onclick = () => { const l = { ...link }; delete l.auto; onChange(l); };
        c.append(ok); td.append(c);
      }
      return td;
    };

    const drawProducts = pane => {
      pane.innerHTML = `<div class="row"><input type="search" id="crm-q" placeholder="Filter products"><select id="crm-cat"><option value="">All categories</option>${CATEGORIES.filter(c => c[0] !== 'furniture').map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}</select>
        <label><input type="checkbox" id="crm-only"> Only linked</label><label><input type="checkbox" id="crm-un"> Only not linked</label><label><input type="checkbox" id="crm-chk"> Needs checking</label></div>
        <table class="tbl crm-table"><thead><tr><th>PlanBuilder product</th><th>Unit</th><th>Material from CRM</th><th>Labor from CRM</th><th class="num">Price</th><th class="num">Labor</th><th></th></tr></thead><tbody></tbody></table>`;
      const tb = pane.querySelector('tbody'), q = pane.querySelector('#crm-q'), cat = pane.querySelector('#crm-cat'), only = pane.querySelector('#crm-only'), un = pane.querySelector('#crm-un'), chk = pane.querySelector('#crm-chk');
      const rows = () => {
        tb.innerHTML = '';
        const w = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const list = app.catalog.filter(p => p.category !== 'furniture' && (!cat.value || p.category === cat.value)
          && (!only.checked || (p.crm && (p.crm.mat || p.crm.lab))) && (!un.checked || !(p.crm && (p.crm.mat || p.crm.lab)))
          && (!chk.checked || (p.crm && ((p.crm.mat && p.crm.mat.auto) || (p.crm.lab && p.crm.lab.auto))))
          && w.every(x => (p.name + ' ' + (p.brand || '') + ' ' + categoryName(p.category)).toLowerCase().includes(x)));
        const MAX = 120;
        if (list.length > MAX) tb.insertAdjacentHTML('beforeend', `<tr><td colspan="7" class="hint">Showing ${MAX} of ${list.length}. Filter or pick a category to narrow it.</td></tr>`);
        list.slice(0, MAX).forEach(p => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td><b>${esc(p.name)}</b><br><small>${esc(categoryName(p.category))}</small></td><td>${esc(p.unit)}</td>`;
          const set = k => link => { p.crm = { ...(p.crm || {}) }; if (link) p.crm[k] = link; else delete p.crm[k]; if (!p.crm.mat && !p.crm.lab) delete p.crm; commit(); rows(); };
          tr.append(linkCell(p.crm, 'mat', p.unit, set('mat')), linkCell(p.crm, 'lab', p.unit, set('lab')));
          tr.insertAdjacentHTML('beforeend', `<td class="num">${money(+p.price || 0)}${p.crm && p.crm.mat ? ' <span class="crm-tag">CRM</span>' : ''}</td><td class="num">${money(+p.labor || 0)}${p.crm && p.crm.lab ? ' <span class="crm-tag">CRM</span>' : ''}</td>`);
          const td = document.createElement('td'); td.style.whiteSpace = 'nowrap';
          const sug = document.createElement('button'); sug.className = 'btn small'; sug.textContent = '✨'; sug.title = 'Show the closest CRM lines'; sug.disabled = !crm.found;
          sug.onclick = () => {
            const box = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 7; cell.className = 'crm-sug';
            const mk = (k, name) => { const sg = suggest(p, crm, k, 5); return `<div><b>${name}:</b> ${sg.length ? sg.map(x => `<button class="btn small" data-k="${k}" data-key="${esc(x.key)}">${esc(x.name)} · ${money(x.cost)} ${esc(x.unitText || x.unit)} <small>${esc(x.from)}</small></button>`).join(' ') : '<i>no close match</i>'}</div>`; };
            cell.innerHTML = mk('mat', 'Material') + mk('lab', 'Labor');
            cell.querySelectorAll('button[data-key]').forEach(b => { b.onclick = () => set(b.dataset.k)({ key: b.dataset.key }); });
            box.append(cell);
            if (tr.nextSibling && tr.nextSibling.querySelector && tr.nextSibling.querySelector('.crm-sug')) tr.nextSibling.remove(); else tr.after(box);
          };
          td.append(sug);
          tr.append(td); tb.append(tr);
        });
      };
      q.oninput = rows;   // not onchange: that fires on blur and would redraw the row being clicked
      [cat, only, un, chk].forEach(e => { e.onchange = rows; });
      rows();
    };

    const drawStudio = pane => {
      pane.innerHTML = `<p class="hint">Studio's installed rates for what it figures from the drawing (structure, MEP, site). A linked rate follows the CRM on every job, unless a job has its own rate typed in Studio → Unit rates.</p>
        <table class="tbl crm-table"><thead><tr><th>Studio item</th><th>Unit</th><th>Material from CRM</th><th>Labor from CRM</th><th class="num">Rate used</th></tr></thead><tbody></tbody></table>`;
      const tb = pane.querySelector('tbody');
      const L = sysLinks();
      const live = crmSystemRates(L, crm, SYS_UNITS);
      RATE_LIST.forEach(([k, name, unit, def]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${esc(name)}</td><td>${unit}</td>`;
        const set = part => link => {
          const all = sysLinks(); const cur = { ...(all[k] || {}) };
          if (link) cur[part] = link; else delete cur[part];
          if (cur.mat || cur.lab) all[k] = cur; else delete all[k];
          store.setPref('crm.sysLinks', all); commit(); drawStudio(pane);
        };
        tr.append(linkCell(L[k], 'mat', unit, set('mat')), linkCell(L[k], 'lab', unit, set('lab')));
        tr.insertAdjacentHTML('beforeend', `<td class="num">${live[k] != null ? money(live[k]) + ' <span class="crm-tag">CRM</span>' : money(def)}</td>`);
        tb.append(tr);
      });
    };
    draw();
  };
}
