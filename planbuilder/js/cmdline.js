// AutoCAD-style command line under the plan. Type a command and press Enter (Space also runs it):
//   L / W / LINE / WALL      draw walls          REC / ROOM          rectangle room
//   PL / SHAPE               room by corners     D / DOOR / WIN      doors and windows
//   F / ROOF                 roof                DI / DIST / M       measure
//   O / ORTHO (F8)           square angles only  OS / OSNAP (F3)     snap to ends / corners / walls
//   SN / SNAP (F9)           grid snap           U / UNDO · REDO     E / ERASE / DEL
//   Z / ZE / ZOOM            fit the plan        C / CLOSE           close the walls back to the start
//   IMPORT                   import a plan       3D · STUDIO · EST   views
// Points while drawing:  x,y (absolute)   @dx,dy (from the last point)   @len<angle   len<angle
//   or just a length: it goes the way the mouse points. Feet-inches work everywhere: 12'6", 12-6, 12.5.
// Enter on an empty line finishes what you are drawing, or repeats the last command.

import { parseFtIn, fmtFtIn } from './geom.js';

const $ = (s, el = document) => el.querySelector(s);

const CMDS = [
  [['L', 'LINE', 'W', 'WALL', 'WA'], 'wall', 'Draw walls'],
  [['REC', 'RECT', 'RECTANG', 'RECTANGLE', 'R', 'ROOM', 'RM'], 'room', 'Rectangle room'],
  [['PL', 'PLINE', 'SHAPE', 'POLY', 'P'], 'roompoly', 'Room by its corners'],
  [['D', 'DOOR', 'WIN', 'WINDOW', 'OPENING'], 'opening', 'Doors and windows'],
  [['I', 'INSERT', 'PRODUCT', 'ITEM'], 'item', 'Place a product'],
  [['F', 'ROOF'], 'roof', 'Roof'],
  [['DI', 'DIST', 'M', 'MEASURE'], 'measure', 'Measure'],
  [['V', 'S', 'SELECT', 'MOVE'], 'select', 'Select / move'],
];
export const HELP = `Commands (type, then Enter or Space):
L · WALL  draw walls        REC · ROOM  rectangle room     PL · SHAPE  room by corners
D · DOOR  doors & windows   I · INSERT  products           F · ROOF   roof
DI · DIST measure           O · ORTHO (F8)  OS · OSNAP (F3)  SN · SNAP (F9)
U · UNDO   REDO   E · ERASE   Z · ZOOM (fit)   C · CLOSE   IMPORT   3D   STUDIO   EST
Points: x,y   @dx,dy   @len<angle   len<angle   or just a length in the mouse's direction.
Angles: 0 = right, 90 = up. Feet-inches: 12'6", 12-6, 12.5.`;

// A typed point. last = the previous point (for @ and lengths). Returns { p } or { len } or null.
export function parsePoint(text, last) {
  const t = text.trim(); let m;
  const L = v => parseFtIn(v.trim());
  const polar = (len, deg) => ({ x: len * Math.cos(deg * Math.PI / 180), y: -len * Math.sin(deg * Math.PI / 180) });
  const r3 = p => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 });
  if ((m = t.match(/^@\s*(.+?)\s*<\s*(-?[\d.]+)\s*$/))) { const d = polar(L(m[1]), +m[2]); return last && isFinite(d.x) ? { p: r3({ x: last.x + d.x, y: last.y + d.y }) } : null; }
  if ((m = t.match(/^(.+?)\s*<\s*(-?[\d.]+)\s*$/))) { const d = polar(L(m[1]), +m[2]); return isFinite(d.x) ? { p: r3(d) } : null; }
  if ((m = t.match(/^@\s*(.+?)\s*[,x×]\s*(.+)$/i))) { const dx = L(m[1]), dy = L(m[2]); return last && isFinite(dx) && isFinite(dy) ? { p: r3({ x: last.x + dx, y: last.y + dy }) } : null; }
  if ((m = t.match(/^(.+?)\s*,\s*(.+)$/))) { const x = L(m[1]), y = L(m[2]); return isFinite(x) && isFinite(y) ? { p: r3({ x, y }) } : null; }
  const len = L(t); if (len > 0) return { len };
  return null;
}

export function installCmd(app) {
  const input = $('#cmd'), prompt = $('#cmd-prompt');
  const hist = []; let hi = 0, last = '', rect = null;
  const plan = () => app.plan;

  const setPrompt = () => {
    const t = app.tool, P = plan();
    let s = 'Command:';
    if (t === 'wall') s = P.chain ? 'Next point, length or C:' : 'First point (click or x,y):';
    else if (t === 'roompoly') s = P.poly && P.poly.length ? 'Next corner or C:' : 'First corner:';
    else if (t === 'room') s = rect ? 'Other corner (@width,depth):' : 'First corner (or 20x14):';
    else if (t === 'measure') s = P.measure && !P.measure.done ? 'Second point:' : 'First point:';
    prompt.textContent = s;
  };
  app.cmdPrompt = setPrompt;

  app.cadToggle = function (k) {
    const P = plan();
    if (k === 'ortho') P.ortho = !P.ortho;
    if (k === 'osnap') P.osnap = P.osnap === false;
    if (k === 'grid') P.gridSnap = P.gridSnap === false;
    const on = k === 'ortho' ? !!P.ortho : k === 'osnap' ? P.osnap !== false : P.gridSnap !== false;
    $('#tg-' + k).classList.toggle('on', on);
    app.status(`${{ ortho: 'ORTHO', osnap: 'OSNAP', grid: 'SNAP' }[k]} ${on ? 'on' : 'off'}`);
  };
  ['ortho', 'osnap', 'grid'].forEach(k => $('#tg-' + k).addEventListener('click', () => app.cadToggle(k)));

  const coords = $('#coords');
  app.showCoords = w => { coords.textContent = `${fmtFtIn(w.x) || "0'"}, ${fmtFtIn(w.y) || "0'"}`; setPrompt(); };

  const say = msg => app.status(msg);
  function lastPoint() {
    const P = plan(), t = app.tool;
    if (t === 'wall' && P.chain) return P.chain.pts[P.chain.pts.length - 1];
    if (t === 'roompoly' && P.poly && P.poly.length) return P.poly[P.poly.length - 1];
    if (t === 'room' && rect) return rect;
    if (t === 'measure' && P.measure && !P.measure.done) return P.measure.a;
    return null;
  }
  function point(text) {
    const P = plan(), t = app.tool;
    if (t !== 'room' && /^\s*[\d.'"\-]+\s*[x×]\s*[\d.'"\-]+\s*$/i.test(text)) { app.setTool('room'); return point(text); }
    const r = parsePoint(text, lastPoint());
    if (t === 'room' && !r && !/[x×]/i.test(text)) return false;
    if (!r && t !== 'room') return false;
    if (t === 'room') {
      let m = text.trim().match(/^@?\s*(.+?)\s*[x×]\s*(.+)$/i);
      if (!rect && m && !/,/.test(text)) {   // "20x14": a room that size at the next free spot
        const w = parseFtIn(m[1]), d = parseFtIn(m[2]); if (!(w > 0 && d > 0)) return false;
        const xs = P.level.walls.flatMap(x => [x.a.x, x.b.x]), x0 = xs.length ? Math.max(...xs) : 0, y0 = xs.length ? Math.min(...P.level.walls.flatMap(x => [x.a.y, x.b.y])) : 0;
        P.makeRectRoom({ x: x0, y: y0, w, h: d }); P.fit(); say(`Room ${fmtFtIn(w)} × ${fmtFtIn(d)} added.`); return true;
      }
      if (!r || !r.p) return false;
      if (!rect) { rect = r.p; say('First corner at ' + fmtFtIn(r.p.x) + ', ' + fmtFtIn(r.p.y) + '. Now the other corner, e.g. @20,14'); return true; }
      const a = rect, b = r.p; rect = null;
      const R = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
      if (R.w < 1 || R.h < 1) { say('That room is too small.'); return true; }
      P.makeRectRoom(R); return true;
    }
    if (r.len != null) {
      if (t === 'wall' || t === 'roompoly') return P.applyLength(r.len);
      return false;
    }
    if (t === 'wall') { P.addWallPoint(r.p); return true; }
    if (t === 'roompoly') { if (!P.poly) P.poly = []; P.poly.push(r.p); P.draw(); return true; }
    if (t === 'measure') {
      if (!P.measure || P.measure.done) P.measure = { a: r.p, b: r.p, done: false };
      else { P.measure.b = r.p; P.measure.done = true; const d = Math.hypot(r.p.x - P.measure.a.x, r.p.y - P.measure.a.y); say('Distance: ' + fmtFtIn(d)); }
      P.draw(); return true;
    }
    return false;
  }
  function closeShape() {
    const P = plan();
    if (app.tool === 'wall' && P.chain && P.chain.pts.length > 2) { P.addWallPoint({ ...P.chain.pts[0] }); return true; }
    if (app.tool === 'roompoly' && P.poly && P.poly.length >= 3) { const pts = P.poly; P.poly = null; P.makePolyRoom(pts); P.draw(); return true; }
    return false;
  }

  app.runCommand = function (raw) {
    const text = (raw || '').trim(), up = text.toUpperCase(), P = plan();
    if (!text) {
      if (P.chain || P.poly || (P.measure && !P.measure.done) || rect) { rect = null; P.finishTool(); setPrompt(); return true; }
      if (last) return app.runCommand(last);
      return false;
    }
    hist.push(text); hi = hist.length;
    // points and lengths first while drawing
    if (/^[@\d.\-]/.test(text) || /[<,]/.test(text) || /^\d.*[x×]/i.test(text)) {
      if (point(text)) { setPrompt(); return true; }
      say(`"${text}" is not a point here. Try 12'6", @12,0, @12<90 or 10,20 – or start a command first (L for walls).`); return false;
    }
    const tool = CMDS.find(([names]) => names.includes(up));
    if (tool) { if (app.view !== 'plan' && app.view !== 'split') app.setView('plan'); rect = null; app.setTool(tool[1]); last = up; say(tool[2] + ' – ' + ({ wall: 'click or type the first point.', room: 'drag a rectangle, type a corner, or type a size like 20x14.', roompoly: 'click or type each corner, C closes.', measure: 'click or type two points.' }[tool[1]] || 'click on the plan.')); setPrompt(); return true; }
    switch (up) {
      case 'C': case 'CLOSE': if (closeShape()) { setPrompt(); return true; } say('Nothing to close.'); return false;
      case 'O': case 'ORTHO': app.cadToggle('ortho'); return true;
      case 'OS': case 'OSNAP': app.cadToggle('osnap'); return true;
      case 'SN': case 'SNAP': case 'GRID': app.cadToggle('grid'); return true;
      case 'U': case 'UNDO': app.doUndo(); return true;
      case 'REDO': case 'MREDO': app.doRedo(); return true;
      case 'E': case 'ERASE': case 'DEL': case 'DELETE': if (!P.deleteSelection()) say('Select something first, then E.'); return true;
      case 'Z': case 'ZE': case 'ZOOM': case 'ZOOMEXTENTS': case 'FIT': P.fit(); return true;
      case 'IMPORT': case 'IMP': case 'PDF': case 'DXF': case 'DWG': app.showImport(); return true;
      case '3D': case 'MAKE3D': app.make3D(); return true;
      case 'STUDIO': app.setView('studio'); return true;
      case 'EST': case 'ESTIMATE': app.setView('estimate'); return true;
      case 'EXT': case 'EXTERIOR': { const cb = $('#opt-ext'); cb.click(); return true; }
      case '?': case 'HELP': case 'H': showHelp(); return true;
      case 'ESC': case 'CANCEL': rect = null; P.finishTool(); return true;
    }
    say(`Unknown command "${text}". Type HELP for the list.`);
    return false;
  };
  function showHelp() {
    const d = document.createElement('div');
    d.innerHTML = '<h2>Command line</h2><pre class="cmd-help"></pre>';
    d.querySelector('pre').textContent = HELP;
    app.modal(d);
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || (e.key === ' ' && !/[\d'"]$/.test(input.value) && !/^@|,|</.test(input.value) && input.value.trim() && !/\s/.test(input.value.trim()) && /^[a-z?]+$/i.test(input.value.trim()))) {
      e.preventDefault();
      const v = input.value; input.value = '';
      app.runCommand(v);
      return;
    }
    if (e.key === 'Escape') { input.value = ''; input.blur(); rect = null; plan().finishTool(); setPrompt(); return; }
    if (e.key === 'ArrowUp') { if (hi > 0) { hi--; input.value = hist[hi]; } e.preventDefault(); }
    if (e.key === 'ArrowDown') { if (hi < hist.length) { hi++; input.value = hist[hi] || ''; } e.preventDefault(); }
    if (e.key === 'F8') { e.preventDefault(); app.cadToggle('ortho'); }
    if (e.key === 'F3') { e.preventDefault(); app.cadToggle('osnap'); }
    if (e.key === 'F9') { e.preventDefault(); app.cadToggle('grid'); }
  });
  setPrompt();
}
