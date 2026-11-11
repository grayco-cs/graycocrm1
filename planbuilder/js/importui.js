// "Import a plan" window: drop a picture, PDF or AutoCAD DXF, check what was found, set the size, and the
// walls, doors, windows and rooms are drawn for you (then the 3D builds).

import { detectWallsInImage, planFromImage, parseDXF, dxfScale, DXF_UNIT_NAMES, planFromDXF, normalizePlan, applyImport } from './planimport.js';
import { addWall, addOpening, addRoom, swingDoorsIntoRooms, autoRoof, fromTemplate } from './model.js';
import { parseFtIn, fmtFtIn } from './geom.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAXPX = 1800;

let pdfjs = null;
async function loadPdf() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}
function imageFromURL(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That picture could not be opened.')); i.src = src; }); }
function canvasOf(src, maxPx) {
  const s = Math.min(1, maxPx / Math.max(src.width, src.height)), c = document.createElement('canvas');
  c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
  const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export function installImport(app) {
  const S = {};   // { kind: 'image'|'pdf'|'dxf', canvas, labels, dxf, det, plan, ftPerPx, pdf, page, name }

  app.showImport = function (file) {
    for (const k of Object.keys(S)) delete S[k];
    const body = document.createElement('div');
    body.className = 'imp';
    body.innerHTML = `
      <h2>Import a floor plan</h2>
      <p class="hint">Drop in a plan you already have. PlanBuilder finds the walls, doors, windows and rooms, draws them, and builds the 3D.</p>
      <label class="imp-drop" id="imp-drop">
        <input type="file" id="imp-file" accept="image/*,.pdf,application/pdf,.dxf,image/vnd.dxf,application/dxf" hidden>
        <b>Drop a plan here or click to choose</b>
        <span>Picture or scan (JPG, PNG) · PDF · AutoCAD DXF</span>
        <small>From AutoCAD: save as DXF (SAVEAS → DXF). DWG files: export them to DXF or PDF first.</small>
      </label>
      <div class="imp-work" id="imp-work" hidden>
        <div class="imp-view"><canvas id="imp-canvas" width="720" height="520"></canvas><div class="imp-legend"><i class="w"></i>Walls <i class="d"></i>Doors <i class="n"></i>Windows <i class="r"></i>Rooms</div></div>
        <div class="imp-side">
          <div class="imp-found" id="imp-found"></div>
          <div id="imp-raster">
            <label class="f full"><span>Overall width of the building (left to right)</span><input id="imp-width" placeholder="40'"></label>
            <p class="hint" id="imp-wguess"></p>
            <label class="f full"><span>Line darkness <em id="imp-dark-v"></em></span><input type="range" id="imp-dark" min="40" max="220"></label>
            <label class="f full"><span>Thinnest wall (pixels) <em id="imp-thick-v"></em></span><input type="range" id="imp-thick" min="3" max="30"></label>
            <label class="f full" id="imp-page-wrap" hidden><span>PDF page</span><select id="imp-page"></select></label>
          </div>
          <div id="imp-cad" hidden>
            <label class="f full"><span>Drawing units</span><select id="imp-units"><option value="1">Inches</option><option value="2">Feet</option><option value="4">Millimeters</option><option value="5">Centimeters</option><option value="6">Meters</option></select></label>
            <p class="hint" id="imp-cadinfo"></p>
          </div>
          <label class="f full"><span>Wall height</span><input id="imp-height" value="9'"></label>
          <label class="f full"><span>This plan is</span><select id="imp-phase"><option value="new">New work (priced)</option><option value="existing">The existing house (not priced)</option></select></label>
          <label class="f full"><span>Put it</span><select id="imp-target"><option value="new">In a new job</option><option value="level">On this level (replaces what is drawn)</option></select></label>
          <label class="chk"><input type="checkbox" id="imp-roof" checked> Put a roof on it</label>
          <label class="chk" id="imp-keep-wrap"><input type="checkbox" id="imp-keep" checked> Keep the picture under the plan to check and trace</label>
          <label class="chk"><input type="checkbox" id="imp-3d" checked> Build the 3D when done</label>
          <div class="row-btns"><button class="btn" id="imp-other">Other file</button><button class="btn primary" id="imp-go">Create the plan</button></div>
        </div>
      </div>`;
    app.modal(body);
    $('#modal .modal-card').classList.add('wide');
    const drop = $('#imp-drop'), input = $('#imp-file');
    input.addEventListener('change', () => input.files[0] && load(input.files[0]));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) load(f); });
    $('#imp-other').onclick = () => { $('#imp-work').hidden = true; drop.hidden = false; input.value = ''; };
    $('#imp-height').value = fmtFtIn(app.level.height || 9);
    let t = null; const later = fn => { clearTimeout(t); t = setTimeout(fn, 180); };
    $('#imp-width').addEventListener('input', () => later(() => { S.widthTyped = true; build(); }));
    $('#imp-dark').addEventListener('input', e => { $('#imp-dark-v').textContent = e.target.value; later(() => { S.dark = +e.target.value; detect(); }); });
    $('#imp-thick').addEventListener('input', e => { $('#imp-thick-v').textContent = e.target.value; later(() => { S.thick = +e.target.value; detect(); }); });
    $('#imp-units').addEventListener('change', () => build());
    $('#imp-page').addEventListener('change', async e => { S.page = +e.target.value; await renderPdfPage(); S.dark = S.thick = undefined; detect(); });
    $('#imp-go').onclick = create;
    if (file) load(file);
  };

  async function load(file) {
    const name = (file.name || '').toLowerCase();
    S.name = file.name || 'Imported plan';
    try {
      app.status('Reading ' + S.name + '…');
      if (/\.dxf$/.test(name) || /dxf/.test(file.type)) {
        S.kind = 'dxf'; S.dxf = parseDXF(await file.text());
        if (!S.dxf.segs.length) throw new Error('No lines found in that DXF. In AutoCAD, check that the plan is in model space and save as DXF again.');
        $('#imp-units').value = String(DXF_UNIT_NAMES[S.dxf.units] ? S.dxf.units : 1);
      } else if (/\.pdf$/.test(name) || file.type === 'application/pdf') {
        S.kind = 'pdf'; const lib = await loadPdf();
        S.pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        S.page = 1;
        $('#imp-page').innerHTML = Array.from({ length: S.pdf.numPages }, (_, i) => `<option value="${i + 1}">Page ${i + 1}</option>`).join('');
        $('#imp-page-wrap').hidden = S.pdf.numPages < 2;
        await renderPdfPage();
      } else if (/^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|bmp)$/.test(name)) {
        S.kind = 'image';
        const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
        S.canvas = canvasOf(await imageFromURL(src), MAXPX); S.labels = [];
      } else throw new Error('Use a picture (JPG / PNG), a PDF or an AutoCAD DXF file.');
      $('#imp-drop').hidden = true; $('#imp-work').hidden = false;
      $('#imp-raster').hidden = S.kind === 'dxf'; $('#imp-cad').hidden = S.kind !== 'dxf';
      $('#imp-keep-wrap').hidden = S.kind === 'dxf';
      S.widthTyped = false; $('#imp-width').value = '';
      detect();
      app.status('');
    } catch (e) {
      console.warn(e); app.status('');
      app.toast(e.message || 'That file could not be read.', 6000);
    }
  }
  async function renderPdfPage() {
    const page = await S.pdf.getPage(S.page || 1), v0 = page.getViewport({ scale: 1 });
    const scale = Math.min(4, 2200 / Math.max(v0.width, v0.height)), vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: x, viewport: vp }).promise;
    const tc = await page.getTextContent();
    S.canvas = canvasOf(c, MAXPX);
    const k = S.canvas.width / c.width;
    S.labels = tc.items.filter(it => it.str && it.str.trim()).map(it => { const [px, py] = vp.convertToViewportPoint(it.transform[4], it.transform[5]); return { x: px * k, y: py * k - 4, text: it.str.trim() }; });
    // join words written as separate pieces on one line ("MASTER" "BEDROOM")
    S.labels.sort((a, b) => a.y - b.y || a.x - b.x);
    const out = []; S.labels.forEach(l => { const p = out[out.length - 1]; if (p && Math.abs(p.y - l.y) < 4 && l.x - p.x2 < 14 && l.x > p.x) { p.text += ' ' + l.text; p.x2 = l.x + l.text.length * 6; } else out.push({ ...l, x2: l.x + l.text.length * 6 }); });
    S.labels = out;
  }

  function detect() {
    if (S.kind === 'dxf') return build();
    const c = S.canvas, img = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
    S.det = detectWallsInImage(img, { dark: S.dark, minThick: S.thick });
    $('#imp-dark').value = S.det.dark; $('#imp-dark-v').textContent = S.det.dark;
    $('#imp-thick').value = S.det.minThick; $('#imp-thick-v').textContent = S.det.minThick;
    build();
  }
  // Size: a typed width, else a guess from the wall thickness (outside walls ≈ 6½")
  function guessWidth() {
    const d = S.det; if (!d.segs.length) return 0;
    const xs = d.segs.flatMap(s => [s.a.x, s.b.x]), wpx = Math.max(...xs) - Math.min(...xs);
    const th = d.segs.map(s => s.t).sort((a, b) => b - a), thick = th[Math.floor(th.length * 0.2)] || th[0];
    return { wpx, ft: Math.max(8, Math.round(wpx / thick * 0.55)) };
  }
  function build() {
    let plan;
    if (S.kind === 'dxf') {
      const units = +$('#imp-units').value, k = dxfScale(units);
      plan = planFromDXF(S.dxf, k);
      $('#imp-cadinfo').textContent = `${S.dxf.segs.length} lines on ${S.dxf.layers.length} layer${S.dxf.layers.length === 1 ? '' : 's'}${S.dxf.texts.length ? `, ${S.dxf.texts.length} labels` : ''}. ` + (plan.mode === 'pairs' ? 'Double-line walls found.' : 'Single-line drawing: each line is a wall.') + (S.dxf.units ? ` The file says ${DXF_UNIT_NAMES[S.dxf.units] || 'units ' + S.dxf.units}.` : ' The file does not say its units; inches assumed.');
      S.k = k;
    } else {
      const g = guessWidth();
      if (!g) { S.plan = null; draw(); $('#imp-found').innerHTML = '<b>No walls found.</b> Try moving <em>Line darkness</em> right, or <em>Thinnest wall</em> left.'; return; }
      let ft = S.widthTyped ? parseFtIn($('#imp-width').value) : g.ft;
      if (!(ft > 0)) ft = g.ft;
      if (!S.widthTyped) $('#imp-width').value = fmtFtIn(ft);
      $('#imp-wguess').textContent = S.widthTyped ? '' : 'Guessed from the wall thickness – type the real width from the plan’s dimensions.';
      S.ftPerPx = ft / g.wpx;
      plan = planFromImage(S.det, S.ftPerPx, { labels: S.labels || [] });
    }
    S.plan = normalizePlan(plan);
    const P = S.plan, area = P.rooms.reduce((a, r) => a + r.area, 0);
    const pts = P.walls.flatMap(w => [w.a, w.b]), W = pts.length ? Math.max(...pts.map(p => p.x)) : 0, H = pts.length ? Math.max(...pts.map(p => p.y)) : 0;
    $('#imp-found').innerHTML = `<b>${P.walls.length}</b> walls · <b>${P.openings.filter(o => o.type === 'door').length}</b> doors · <b>${P.openings.filter(o => o.type === 'window').length}</b> windows · <b>${P.rooms.length}</b> rooms<br><span>${esc(fmtFtIn(W))} × ${esc(fmtFtIn(H))} · ${Math.round(area).toLocaleString()} SF inside</span>`;
    draw();
  }
  function draw() {
    const cv = $('#imp-canvas'); if (!cv) return;
    const x = cv.getContext('2d'), P = S.plan;
    x.clearRect(0, 0, cv.width, cv.height);
    // world bounds (feet)
    let X0, Y0, X1, Y1;
    if (S.kind !== 'dxf' && S.canvas && S.ftPerPx) { const sh = P ? P.shift : { x: 0, y: 0 }; X0 = -sh.x; Y0 = -sh.y; X1 = X0 + S.canvas.width * S.ftPerPx; Y1 = Y0 + S.canvas.height * S.ftPerPx; }
    else if (P && P.walls.length) { const pts = P.walls.flatMap(w => [w.a, w.b]); X0 = Math.min(...pts.map(p => p.x)) - 3; Y0 = Math.min(...pts.map(p => p.y)) - 3; X1 = Math.max(...pts.map(p => p.x)) + 3; Y1 = Math.max(...pts.map(p => p.y)) + 3; }
    else { if (S.canvas) x.drawImage(S.canvas, 0, 0, cv.width, cv.width * S.canvas.height / S.canvas.width); return; }
    const s = Math.min(cv.width / (X1 - X0), cv.height / (Y1 - Y0)), ox = (cv.width - (X1 - X0) * s) / 2 - X0 * s, oy = (cv.height - (Y1 - Y0) * s) / 2 - Y0 * s;
    const T = p => [ox + p.x * s, oy + p.y * s];
    if (S.kind !== 'dxf' && S.canvas) { x.globalAlpha = 0.35; const [a, b] = T({ x: X0, y: Y0 }); x.drawImage(S.canvas, a, b, (X1 - X0) * s, (Y1 - Y0) * s); x.globalAlpha = 1; }
    if (S.kind === 'dxf') {
      x.strokeStyle = 'rgba(140,160,190,.45)'; x.lineWidth = 1; x.beginPath();
      const sh = P.shift || { x: 0, y: 0 };
      S.dxf.segs.forEach(g => { const a = T({ x: g.a.x * S.k - sh.x, y: -g.a.y * S.k - sh.y }), b = T({ x: g.b.x * S.k - sh.x, y: -g.b.y * S.k - sh.y }); x.moveTo(...a); x.lineTo(...b); });
      x.stroke();
    }
    if (!P) return;
    P.rooms.forEach((r, i) => {
      x.fillStyle = `hsla(${(i * 57) % 360}, 70%, 60%, .18)`; x.beginPath(); r.points.forEach((p, j) => { const q = T(p); j ? x.lineTo(...q) : x.moveTo(...q); }); x.closePath(); x.fill();
      const c = r.points.reduce((a, p) => ({ x: a.x + p.x / r.points.length, y: a.y + p.y / r.points.length }), { x: 0, y: 0 }), q = T(c);
      x.fillStyle = '#e8f1ff'; x.font = '600 12px Inter, sans-serif'; x.textAlign = 'center'; x.fillText(r.name, q[0], q[1]); x.font = '11px Inter, sans-serif'; x.fillStyle = '#9fb3d1'; x.fillText(Math.round(r.area) + ' SF', q[0], q[1] + 14);
    });
    x.lineCap = 'square';
    P.walls.forEach(w => { x.strokeStyle = '#ff9f43'; x.lineWidth = Math.max(2, (w.t || 0.4) * s); x.beginPath(); x.moveTo(...T(w.a)); x.lineTo(...T(w.b)); x.stroke(); });
    P.openings.forEach(o => {
      const w = P.walls[o.wall], L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
      const a = { x: w.a.x + u.x * (o.c - o.width / 2), y: w.a.y + u.y * (o.c - o.width / 2) }, b = { x: w.a.x + u.x * (o.c + o.width / 2), y: w.a.y + u.y * (o.c + o.width / 2) };
      x.strokeStyle = o.type === 'window' ? '#4cc3ff' : '#3ddc97'; x.lineWidth = Math.max(3, (w.t || 0.4) * s + 1); x.beginPath(); x.moveTo(...T(a)); x.lineTo(...T(b)); x.stroke();
    });
  }

  function create() {
    const P = S.plan;
    if (!P || !P.walls.length) { app.toast('No walls to make yet.'); return; }
    const height = parseFtIn($('#imp-height').value), phase = $('#imp-phase').value, target = $('#imp-target').value;
    const keep = $('#imp-keep').checked, roof = $('#imp-roof').checked, make3d = $('#imp-3d').checked;
    if (target === 'level' && (app.level.walls.length || app.level.rooms.length) && !confirm('Replace everything drawn on this level with the imported plan?')) return;
    if (target === 'new') {
      const p = fromTemplate('blank', app.catalog);
      p.name = S.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').slice(0, 60) || 'Imported plan';
      app.open(p, true);
    }
    app.takeSnapshot && app.takeSnapshot();
    const L = app.level, proj = app.project;
    L.walls = []; L.openings = []; L.rooms = []; L.items = [];
    proj.roofs = proj.roofs.filter(r => r.levelId !== L.id);
    if (height > 0) L.height = height;
    const find = id => app.catalog.find(p => p.id === id);
    const pick = (...ids) => ids.map(find).find(Boolean) || null;
    const products = { door: pick('dr-int-6p'), extDoor: pick('dr-ext-steel'), window: pick('wn-sh-3050'), garage: pick('dr-garage-16'), cased: pick('op-cased', 'dr-int-6p') };
    const res = applyImport(L, P, proj.settings, { addWall, addOpening, addRoom, swingDoorsIntoRooms }, products, { phase });
    if (S.kind !== 'dxf' && keep && S.canvas) {
      const src = S.canvas.toDataURL('image/jpeg', 0.82);
      L.underlay = { src, x: -P.shift.x, y: -P.shift.y, scale: S.ftPerPx, opacity: 0.35 };
    } else delete L.underlay;
    if (roof) { const rf = autoRoof(proj, L, { ...app.roofDefaults(), phase }); if (rf && phase) rf.phase = phase; }
    app.closeModal();
    app.commit(`Imported plan: ${res.walls} walls, ${res.doors} doors, ${res.windows} windows, ${res.rooms} rooms`);
    app.plan.fit();
    app.toast(`Plan drawn: ${res.rooms} rooms, ${Math.round(res.area).toLocaleString()} SF. Check the walls and room names, then fix anything with the Select tool.`, 7000);
    if (make3d) app.make3D();
  }
}
