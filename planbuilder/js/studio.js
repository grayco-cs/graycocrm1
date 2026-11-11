// Studio: a construction dashboard around the 3D view. Left: the budget and the building systems
// (each one can be shown, hidden or picked). Top: view, cutaway and display modes. Right: the picked
// system's line items. Bottom: the build timeline, step by step, with the dollars in place so far.
// Every dollar figure carries .price-only, so the customer view never shows pricing.

import * as THREE from 'three';
import { analyzeSystems, STEPS, RATE_LIST, rates, structureType } from './systems.js';
import { computeTakeoff } from './takeoff.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const m0 = v => '$' + Math.round(v || 0).toLocaleString('en-US');
const mK = v => { v = v || 0; const a = Math.abs(v); return a >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : a >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + Math.round(v); };
const n1 = v => (Math.round((v || 0) * 10) / 10).toLocaleString('en-US');
const pad2 = n => String(n).padStart(2, '0');
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6A17 17 0 002 12s3.6 7 10 7a10 10 0 005.4-1.6"/></svg>';

export function installStudio(app) {
  const S = {
    playing: false, speed: 1, timer: null,
    get scene() { return app.view3d && app.view3d.studio; },
  };

  // The budget by system: structure figured from the drawing + the estimate's own lines.
  app.studioAnalysis = function () {
    const P = this.project, s = P.settings, keep = s.includeStructure;
    s.includeStructure = false;
    let T; try { T = computeTakeoff(P, this.catalog, { book: this.activeBook() }); } finally { s.includeStructure = keep; }
    this._studioA = analyzeSystems(P, this.catalog, T);
    return this._studioA;
  };

  app.openStudio = function () {
    const v = this.view3d; if (!v) return;
    $('#studio').hidden = false;
    v.setStudio(true);
    const sc = S.scene;
    if (sc && !sc.st.step) sc.st.step = 16;
    renderStudio();
    if (!this._studioFitted) { v.setPreset('iso'); this._studioFitted = true; }
  };
  app.closeStudio = function () {
    stop();
    $('#studio').hidden = true;
    if (this.view3d && this.view3d.opts.studio) { this.view3d.setStudio(false); $$('#studio .st-mode').forEach(b => b.classList.remove('on')); }
  };
  app.renderStudio = () => renderStudio();

  // ---------- hover label and click to pick a system ----------
  app.studioHover = function (e) {
    const tip = $('#st-tip'), sc = S.scene; if (!sc || S.playing) { tip.hidden = true; return; }
    const hit = sc.hit(e);
    if (!hit) { tip.hidden = true; return; }
    const m = hit.object.userData.member || {}, sys = (this._studioA.systems.find(x => x.id === hit.object.userData.sys) || { name: 'Existing', color: '#7a828c' });
    tip.innerHTML = `<i style="background:${sys.color}"></i><b>${esc(m.label || sys.name)}</b>` + (m.cost > 0 ? `<span class="price-only">${m0(m.cost * (this._studioA.markupFactor || 1))}</span>` : '') + `<small>${esc(sys.name)}</small>`;
    const r = $('#stage').getBoundingClientRect();
    tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top - 12) + 'px';
    tip.hidden = false;
  };
  app.studioClick = function (e) {
    const sc = S.scene; if (!sc) return;
    const hit = sc.hit(e), id = hit ? hit.object.userData.sys : null;
    pick(id && id !== 'exist' ? (sc.st.sel === id ? null : id) : null);
  };

  function pick(id) {
    const sc = S.scene; if (!sc) return;
    sc.select(id);
    document.querySelectorAll('#st-sys li').forEach(li => li.classList.toggle('on', li.dataset.sys === id));
    renderDrawer();
  }

  // ---------- panels ----------
  function renderStudio() {
    const A = app._studioA || app.studioAnalysis(), P = app.project, sc = S.scene;
    const root = $('#studio'); if (!root || !A) return;
    const steel = A.type === 'steel';
    const rev = P.version || 1;
    // left: project, total, KPIs, systems
    const used = A.systems.filter(s => s.total > 0.5 || A.members.some(m => m.sys === s.id));
    $('#st-left').innerHTML = `
      <div class="st-prj"><b>${esc(P.name)}</b><small>${steel ? 'Steel frame' : 'Wood frame'} · Systems model · Rev ${rev}</small></div>
      <div class="st-total price-only"><small>Total</small><b>${m0(A.total)}</b></div>
      <div class="st-kpis">
        <div class="price-only"><small>$ / SF</small><b>${m0(A.perSF)}</b></div>
        <div><small>Area</small><b>${Math.round(A.sf).toLocaleString()} SF</b></div>
        <div><small>Concrete</small><b>${n1(A.stat.concreteCY)} CY</b></div>
        ${steel ? `<div><small>Steel</small><b>${n1(A.stat.steelTons)} TN</b></div>` : `<div><small>Rebar slab</small><b>${Math.round(A.stat.rebarSF).toLocaleString()} SF</b></div>`}
        <div><small>Studs</small><b>${Math.max(0, A.stat.studs).toLocaleString()}</b></div>
        <div><small>Systems</small><b>${used.length}</b></div>
      </div>
      <div class="st-sub">Systems</div>
      <ul id="st-sys" class="st-sys">${used.map(s => `
        <li data-sys="${s.id}" class="${sc && sc.st.sel === s.id ? 'on' : ''}${sc && sc.st.hidden.has(s.id) ? ' off' : ''}" title="Step ${s.step}: ${esc(STEPS[s.step - 1])}">
          <i style="background:${s.color}"></i><span>${esc(s.name)}</span><em class="price-only">${mK(s.total)}</em>
          <button class="st-eye" aria-label="Show or hide ${esc(s.name)}">${sc && sc.st.hidden.has(s.id) ? EYE_OFF : EYE}</button></li>`).join('')}
      </ul>
      <div class="st-opts">
        <label>Structure <select id="st-type"><option value="auto">Auto (${P.type === 'commercial' ? 'steel' : 'wood'})</option><option value="wood">Wood frame</option><option value="steel">Steel frame</option></select></label>
        <label class="price-only"><input type="checkbox" id="st-inc"> Include structure, MEP &amp; site in the estimate</label>
        <button class="btn price-only" id="st-rates">Unit rates…</button>
      </div>`;
    $('#st-type').value = P.settings.structure || 'auto';
    $('#st-type').onchange = e => { P.settings.structure = e.target.value === 'auto' ? undefined : e.target.value; app.commit('Structure type'); };
    $('#st-inc').checked = !!P.settings.includeStructure;
    $('#st-inc').onchange = e => { P.settings.includeStructure = e.target.checked; app.commit(e.target.checked ? 'Structure added to the estimate' : 'Structure left out of the estimate'); };
    $('#st-rates').onclick = showRates;
    $('#st-left').querySelectorAll('#st-sys li').forEach(li => {
      li.addEventListener('click', e => {
        const id = li.dataset.sys;
        if (e.target.closest('.st-eye')) { const on = S.scene.st.hidden.has(id); S.scene.toggle(id, on); li.classList.toggle('off', !on); li.querySelector('.st-eye').innerHTML = on ? EYE : EYE_OFF; return; }
        pick(S.scene.st.sel === id ? null : id);
      });
    });
    renderDrawer();
    renderTime();
  }

  function renderDrawer() {
    const A = app._studioA, sc = S.scene, d = $('#st-drawer');
    const s = sc && sc.st.sel && A.systems.find(x => x.id === sc.st.sel);
    const was = d.hidden;
    d.hidden = !s;
    if (was !== d.hidden && app.view3d) requestAnimationFrame(() => app.view3d.resize());
    if (!s) return;
    const k = A.markupFactor || 1;
    d.innerHTML = `
      <header><div><b>${esc(s.name)}</b><small>Step ${s.step} · ${esc(STEPS[s.step - 1])}</small></div><button class="st-x" aria-label="Close">×</button></header>
      <div class="st-kpis three price-only">
        <div><small>Total</small><b>${mK(s.total)}</b></div><div><small>$ / SF</small><b>${'$' + (s.perSF || 0).toFixed(2)}</b></div><div><small>Share</small><b>${(s.share * 100).toFixed(1)}%</b></div>
      </div>
      <div class="st-sub">Line items</div>
      <table class="st-lines"><thead><tr><th>Item</th><th>Qty</th><th class="price-only">Amount</th></tr></thead><tbody>
        ${s.lines.length ? s.lines.map(l => `<tr><td>${esc(l.name)}${l.detail ? `<small>${esc(l.detail)}${l.rate ? `<span class="price-only"> · ${'$' + (+l.rate).toFixed(2)}/${esc(l.unit)}</span>` : ''}</small>` : ''}</td><td>${(+l.qty).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${esc(l.unit)}</td><td class="price-only">${m0(l.amount)}</td></tr>`).join('')
          : '<tr><td colspan="3" class="muted">Nothing priced here yet. Add products or lines to the job, or set the unit rates.</td></tr>'}
        ${s.direct > 0 && k > 1.0001 ? `<tr class="price-only"><td>Tax, overhead &amp; profit</td><td></td><td>${m0(s.total - s.direct)}</td></tr>` : ''}
      </tbody><tfoot class="price-only"><tr><td>Total</td><td></td><td>${m0(s.total)}</td></tr></tfoot></table>
      <div class="st-dbtns"><button class="btn" id="st-focus">Fly to it</button><button class="btn" id="st-solo">Show only this</button></div>`;
    d.querySelector('.st-x').onclick = () => pick(null);
    $('#st-focus').onclick = () => focusSystem(s.id);
    $('#st-solo').onclick = () => {
      const sc2 = S.scene, all = A.systems.map(x => x.id), solo = all.every(id => id === s.id || sc2.st.hidden.has(id));
      all.forEach(id => { if (id !== s.id) { if (solo) sc2.st.hidden.delete(id); else sc2.st.hidden.add(id); } });
      sc2.apply(); renderStudio();
    };
  }
  function focusSystem(id) {
    const v = app.view3d, sc = S.scene, box = new THREE.Box3();
    sc.groups.forEach(g => g.traverse(o => { if (o.isMesh && o.userData.sys === id && o.visible) box.expandByObject(o); }));
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), r = Math.max(size.x, size.y, size.z) * 1.1 + 8;
    const dir = v.camera.position.clone().sub(v.controls.target).normalize();
    v.flyTo(c.clone().add(dir.multiplyScalar(r)), c, 900);
  }

  // ---------- timeline ----------
  function renderTime() {
    const A = app._studioA, sc = S.scene, step = sc ? sc.st.step : 16;
    if (!A) return;
    const inPlace = A.systems.filter(s => s.step <= step).reduce((a, s) => a + s.total, 0);
    $('#st-play').innerHTML = S.playing ? '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>';
    $('#st-step').textContent = step ? pad2(step) : '00';
    $('#st-phase').textContent = step ? STEPS[step - 1] : 'Existing';
    $('#st-range').value = step;
    $('#st-inplace').textContent = m0(inPlace);
    $('#st-inplace-pct').textContent = A.total > 0 ? Math.round(inPlace / A.total * 100) + '%' : '';
    $('#st-range').style.setProperty('--p', (step / 16 * 100) + '%');
    $('#st-chips').querySelectorAll('button').forEach((b, i) => { b.classList.toggle('on', i + 1 === step); b.classList.toggle('done', i + 1 < step); });
    $('#st-speed').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.s === S.speed));
  }
  function goStep(n, animate) {
    const sc = S.scene; if (!sc) return;
    n = Math.max(0, Math.min(16, n));
    sc.setStep(n, animate, 900 / S.speed);
    if (sc.st.cut < 0.999) sc.cutaway(sc.st.cut);
    renderTime();
  }
  function play() {
    const sc = S.scene; if (!sc) return;
    if (S.playing) { stop(); return; }
    S.playing = true;
    if (sc.st.step >= 16) goStep(0, false);
    const v = app.view3d; v.controls.autoRotate = true; v.controls.autoRotateSpeed = 0.45 * S.speed;
    const tick = () => {
      if (!S.playing) return;
      if (sc.st.step >= 16) { stop(); return; }
      goStep(sc.st.step + 1, true);
      S.timer = setTimeout(tick, 1500 / S.speed);
    };
    tick(); renderTime();
  }
  function stop() {
    S.playing = false; clearTimeout(S.timer);
    const v = app.view3d; if (v) { v.controls.autoRotate = !!v.opts.spin; }
    if ($('#st-play')) renderTime();
  }

  // ---------- unit rates (never shown to customers) ----------
  function showRates() {
    const P = app.project, R = rates(P), body = document.createElement('div');
    body.innerHTML = `<h2>Unit rates – structure, MEP &amp; site</h2>
      <p class="hint">Installed cost per unit (material + labor) used by Studio for everything figured from the drawing. These are starting placeholders: put in your own numbers, or link them to the CRM. A rate typed here is saved with this job and wins over the CRM.</p>
      <table class="tbl st-rates"><thead><tr><th>Item</th><th>Unit</th><th>Rate</th></tr></thead><tbody>
      ${RATE_LIST.map(([k, label, unit, def]) => `<tr><td>${esc(label)}</td><td>${unit}</td><td><input type="number" step="0.01" min="0" data-k="${k}" value="${R[k]}" title="Default ${def}"></td></tr>`).join('')}
      </tbody></table>
      <div class="row-btns"><button class="btn" id="st-rates-crm" title="Link these rates to the prices in the GrayCo CRM">🔗 CRM prices</button><button class="btn" id="st-rates-reset">Back to defaults</button><button class="btn primary" id="st-rates-save">Save rates</button></div>`;
    app.modal(body);
    $('#st-rates-save').onclick = () => {
      const base = rates({ settings: {} });   // defaults, or the CRM price when that rate is linked
      const o = {}; body.querySelectorAll('input[data-k]').forEach(i => { if (i.value !== '' && +i.value !== base[i.dataset.k]) o[i.dataset.k] = +i.value; });
      P.settings.sysRates = o; app.closeModal(); app.commit('Unit rates');
    };
    $('#st-rates-reset').onclick = () => { const base = rates({ settings: {} }); body.querySelectorAll('input[data-k]').forEach(i => { i.value = base[i.dataset.k]; }); };
    $('#st-rates-crm').onclick = () => app.showCRM('studio');
  }

  // ---------- one-time wiring of the static controls ----------
  const chips = $('#st-chips');
  chips.innerHTML = STEPS.map((s, i) => `<button data-step="${i + 1}" title="${esc(s)}"><b>${pad2(i + 1)}</b><span>${esc(s)}</span></button>`).join('');
  chips.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { stop(); goStep(+b.dataset.step, true); } });
  $('#st-play').addEventListener('click', play);
  $('#st-range').addEventListener('input', e => { stop(); goStep(+e.target.value, false); });
  $('#st-speed').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.speed = +b.dataset.s; if (S.playing && app.view3d) app.view3d.controls.autoRotateSpeed = 0.45 * S.speed; renderTime(); });
  $('#st-views').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !app.view3d) return;
    $('#st-views').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    app.view3d.setPreset(b.dataset.p);
  });
  $('#st-cut').addEventListener('input', e => { const sc = S.scene; if (sc) sc.set('cut', +e.target.value / 100); $('#st-cut').style.setProperty('--p', e.target.value + '%'); });
  $('#st-modes').addEventListener('click', e => {
    const b = e.target.closest('button'), v = app.view3d, sc = S.scene; if (!b || !sc) return;
    const m = b.dataset.m, on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    if (m === 'explode') sc.explode(on);
    else if (m === 'ortho') v.setOrtho(on);
    else sc.set(m, on);
  });
  return S;
}
