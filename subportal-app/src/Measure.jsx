/* patch MEASURE (owner 11/20: "i do want them to be able to use a measuring tool for plans with scale" · "be able to write notes in the plan
   takeoff measure tool and save measurements when measured SF and LF etc.")
   The plan measure tool — phone first. A PDF (every page) or a picture, pinch / drag to zoom and move, + / − buttons.
     Scale per page: a preset (1/8"=1' … 1"=50', PDF plans printed to scale) or two taps on a known length.
     Tools: 📏 Line (LF; height → wall SF) · ▭ Rect and ⬡ Area (SF + perimeter LF; depth → CY) · ⊕ Count (EA) · 📝 Note (a pin with text).
     Every measurement has a name and a note. ☰ List: totals by name + unit, every item (edit / delete), ⬇ CSV.
   Saved on the server (subportal.js action 'takeoffs', _lib/takeoffs.js): per person + job + plan file, all pages — any phone or computer.
   No popups: scale, names and notes are typed into the panel at the bottom; the plan stays in view. */
import React, { useEffect, useRef, useState } from 'react';
import { api } from './auth.js';

const C = { navy: '#140665', gold: '#D4A017', line: '#E2E8F0', text: '#0F172A', mute: '#64748B', bg: '#F1F5F9', red: '#B91C1C', green: '#15803D' };
const COLORS = { line: '#2563EB', rect: '#059669', area: '#059669', count: '#DC2626', note: '#A16207' };
export const PRESETS = [['1/8"=1\'', 9], ['3/16"=1\'', 13.5], ['1/4"=1\'', 18], ['3/8"=1\'', 27], ['1/2"=1\'', 36], ['1"=10\'', 7.2], ['1"=20\'', 3.6], ['1"=30\'', 2.4], ['1"=50\'', 1.44]];   // page units (PDF points, 72 / inch) per foot
const L = {
  en: { close: 'Close', page: 'Page', of: 'of', setScale: 'Set scale', scale: 'Scale', noScale: '⚠ Set the scale', move: 'Move', line: 'Line', rect: 'Rect', area: 'Area', count: 'Count', note: 'Note', list: 'List',
    presets: 'Plan scale (PDF printed to scale)', known: 'Or measure a known length', knownHint: 'Tap both ends of a dimension you know (a door, a wall with a number on it).', knownLen: 'Real length (e.g. 12\'6" or 12.5)',
    allPages: 'Use on every page', apply: 'Set scale', cancel: 'Cancel', imgNoPreset: 'A picture has no print size — measure a known length.', name: 'Name (groups the totals)', noteL: 'Note', height: 'Wall height (ft) → wall SF', depth: 'Depth (in) → CY',
    del: 'Delete', done: 'Done', finish: '✓ Finish area', finishCount: '✓ Done counting', tapLine: 'Tap the start, then the end.', tapRect: 'Tap one corner, then the opposite corner.', tapArea: 'Tap each corner, then ✓ Finish area.',
    tapCount: 'Tap each item to count it.', tapNote: 'Tap where the note goes.', tapScale: 'Tap the first end of the known length.', tapScale2: 'Now tap the other end.', noteText: 'Note text', totals: 'Totals', items: 'Every measurement', none: 'Nothing measured yet. Pick a tool below.',
    csv: '⬇ Export CSV', saved: 'Saved ✓', saving: 'Saving…', saveErr: 'Not saved — retrying', loading: 'Loading plan…', loadErr: 'This plan could not be opened.', private: 'Only you see your takeoff.', staff: 'GrayCo staff takeoff — saved to the job.', fit: 'Fit', needScale: 'set scale' },
  es: { close: 'Cerrar', page: 'Página', of: 'de', setScale: 'Escala', scale: 'Escala', noScale: '⚠ Ponga la escala', move: 'Mover', line: 'Línea', rect: 'Rect', area: 'Área', count: 'Contar', note: 'Nota', list: 'Lista',
    presets: 'Escala del plano (PDF a escala)', known: 'O mida un largo conocido', knownHint: 'Toque los dos extremos de una medida que conoce.', knownLen: 'Largo real (ej. 12\'6" o 12.5)',
    allPages: 'Usar en todas las páginas', apply: 'Poner escala', cancel: 'Cancelar', imgNoPreset: 'Una foto no tiene tamaño de impresión — mida un largo conocido.', name: 'Nombre (agrupa los totales)', noteL: 'Nota', height: 'Altura del muro (pies) → SF de muro', depth: 'Espesor (pulg) → CY',
    del: 'Borrar', done: 'Listo', finish: '✓ Terminar área', finishCount: '✓ Terminar conteo', tapLine: 'Toque el inicio y luego el final.', tapRect: 'Toque una esquina y luego la opuesta.', tapArea: 'Toque cada esquina y luego ✓ Terminar área.',
    tapCount: 'Toque cada pieza para contarla.', tapNote: 'Toque donde va la nota.', tapScale: 'Toque el primer extremo del largo conocido.', tapScale2: 'Ahora toque el otro extremo.', noteText: 'Texto de la nota', totals: 'Totales', items: 'Todas las mediciones', none: 'Nada medido todavía. Escoja una herramienta abajo.',
    csv: '⬇ Exportar CSV', saved: 'Guardado ✓', saving: 'Guardando…', saveErr: 'No guardado — reintentando', loading: 'Cargando plano…', loadErr: 'No se pudo abrir este plano.', private: 'Solo usted ve su medición.', staff: 'Medición de GrayCo — guardada en el trabajo.', fit: 'Ajustar', needScale: 'falta escala' },
};

/* the math — the same formulas as the server (_lib/takeoffs.js) */
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const pathLen = p => { let t = 0; for (let i = 1; i < p.length; i++) t += dist(p[i - 1], p[i]); return t; };
const ring = m => { if (m.type !== 'rect') return m.pts; const [a, b = a] = m.pts; return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]]; };
const areaPx = p => { let t = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; t += p[i][0] * p[j][1] - p[j][0] * p[i][1]; } return Math.abs(t) / 2; };
export function qty(m, ppf) {
  if (m.type === 'count') return { ea: m.pts.length };
  if (m.type === 'note' || !(ppf > 0)) return {};
  if (m.type === 'line') { const lf = pathLen(m.pts) / ppf; return m.height ? { lf, wallSf: lf * m.height } : { lf }; }
  const r = ring(m); if (r.length < 3) return {};
  const sf = areaPx(r) / (ppf * ppf), lf = (pathLen(r) + dist(r[r.length - 1], r[0])) / ppf;
  return m.depth ? { sf, lf, cy: sf * m.depth / 12 / 27 } : { sf, lf };
}
const DEF = { line: 'Line', rect: 'Area', area: 'Area', count: 'Count' };
export function totals(doc) {
  const g = new Map();
  const add = (name, unit, v) => { if (!(v > 0)) return; const k = name.toLowerCase() + '|' + unit; const x = g.get(k) || { name, unit, qty: 0, n: 0 }; x.qty += v; x.n++; g.set(k, x); };
  (doc.items || []).forEach(m => {
    const q = qty(m, doc.pages?.[m.page]?.ppf), nm = (m.name || '').trim() || DEF[m.type] || '';
    if (m.type === 'line') { add(nm, 'LF', q.lf); add(nm + ' (wall)', 'SF', q.wallSf); }
    else if (m.type === 'rect' || m.type === 'area') { add(nm, 'SF', q.sf); add(nm + ' (perimeter)', 'LF', q.lf); add(nm, 'CY', q.cy); }
    else if (m.type === 'count') add(nm, 'EA', q.ea);
  });
  return [...g.values()];
}
const fmt = (v, u) => (u === 'EA' ? Math.round(v) : Math.round(v * 100) / 100).toLocaleString('en-US') + ' ' + u;
export function parseFeet(str) {
  const t = String(str || '').trim().replace(/[’′]/g, "'").replace(/[”″]/g, '"');
  let m = /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|pies)\s*-?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in)?)?$/i.exec(t); if (m) return +m[1] + (m[2] ? +m[2] / 12 : 0);
  m = /^(\d+(?:\.\d+)?)\s*(?:"|in)$/i.exec(t); if (m) return +m[1] / 12;
  const x = parseFloat(t); return isFinite(x) && x > 0 ? x : null;
}
const uid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); };
    s.onerror = rej; document.head.appendChild(s);
  });
}
const isPdf = f => /pdf/i.test(f.type || '') || /\.pdf$/i.test(f.name || '');
export const canMeasure = f => !!f && (isPdf(f) || /^image\//i.test(f.type || '') || /\.(png|jpe?g|webp|gif)$/i.test(f.name || ''));

export default function MeasureTool({ file, jobId, mt, lang = 'en', staff = false, onClose, onSaved }) {
  const t = L[lang === 'es' ? 'es' : 'en'];
  const pdf = isPdf(file);
  const vpRef = useRef(null), canvasRef = useRef(null), pdfRef = useRef(null), ptrs = useRef(new Map()), gest = useRef(null);
  const [numPages, setNumPages] = useState(1), [pg, setPg] = useState(1), [size, setSize] = useState(null), [err, setErr] = useState('');
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const [doc, setDoc] = useState({ pages: {}, items: [] }), [loaded, setLoaded] = useState(false), [save, setSave] = useState('');
  const [tool, setTool] = useState('move'), [pend, setPend] = useState([]), [sel, setSel] = useState(null), [panel, setPanel] = useState('');
  const [countId, setCountId] = useState(null), [knownLen, setKnownLen] = useState(''), [allPages, setAllPages] = useState(true), [imgSrc, setImgSrc] = useState('');
  const dirty = useRef(false);
  const base = mt ? { mt } : { jobId, file: { name: file.name, type: file.type || '' } };
  const call = (op, extra) => api('takeoffs', { op, ...base, ...(extra || {}) }, mt ? { anonymous: true } : {});

  /* load the saved takeoff */
  useEffect(() => { let off = false;
    call('get').then(r => { if (!off && r.doc) setDoc({ pages: r.doc.pages || {}, items: r.doc.items || [] }); }).catch(() => {}).finally(() => { if (!off) setLoaded(true); });
    return () => { off = true; }; }, []); // eslint-disable-line
  /* save (0.7 s after the last change; again after a failure) */
  useEffect(() => {
    if (!loaded || !dirty.current) return;
    setSave('saving');
    const h = setTimeout(function go() {
      call('put', { doc }).then(r => { setSave('saved'); onSaved && onSaved(r); }).catch(() => { setSave('err'); setTimeout(go, 4000); });
    }, 700);
    return () => clearTimeout(h);
  }, [doc]); // eslint-disable-line
  const change = fn => { dirty.current = true; setDoc(d => fn(d)); };

  /* the plan: a PDF (pdf.js) or a picture */
  useEffect(() => { let off = false;
    if (!file.url) { setErr(t.loadErr); return; }
    if (!pdf) { const im = new Image(); im.onload = () => { if (!off) { setImgSrc(file.url); setSize({ w: im.naturalWidth, h: im.naturalHeight }); } }; im.onerror = () => !off && setErr(t.loadErr); im.src = file.url; return () => { off = true; }; }
    loadPdfJs().then(lib => lib.getDocument({ url: file.url }).promise).then(d => { if (off) return; pdfRef.current = d; setNumPages(d.numPages); renderPage(1); }).catch(() => !off && setErr(t.loadErr));
    return () => { off = true; };
  }, []); // eslint-disable-line
  async function renderPage(n) {
    const d = pdfRef.current; if (!d) return;
    const page = await d.getPage(n), v1 = page.getViewport({ scale: 1 });
    const rs = Math.min(3, Math.max(1, 2400 / Math.max(v1.width, v1.height)) * (window.devicePixelRatio > 1 ? 1.25 : 1));
    const vp = page.getViewport({ scale: rs }), c = canvasRef.current; if (!c) return;
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    setSize({ w: v1.width, h: v1.height });
  }
  useEffect(() => { if (pdf && pdfRef.current) { setSize(null); renderPage(pg); } setPend([]); setSel(null); setCountId(null); }, [pg]); // eslint-disable-line
  /* fit to the screen when a page opens */
  const fit = () => { const el = vpRef.current; if (!el || !size) return; const r = el.getBoundingClientRect(); const z = Math.min(r.width / size.w, r.height / size.h) * 0.98; setView({ z, x: (r.width - size.w * z) / 2, y: (r.height - size.h * z) / 2 }); };
  useEffect(fit, [size]); // eslint-disable-line

  const ppf = doc.pages[pg]?.ppf || 0;
  const pageItems = doc.items.filter(m => m.page === pg);
  const selItem = doc.items.find(m => m.id === sel) || null;
  const upd = (id, p) => change(d => ({ ...d, items: d.items.map(m => m.id === id ? { ...m, ...p } : m) }));
  const del = id => { change(d => ({ ...d, items: d.items.filter(m => m.id !== id) })); if (sel === id) setSel(null); if (countId === id) setCountId(null); };
  const lastName = type => { const l = doc.items.filter(m => m.type === type && m.name); return l.length ? l[l.length - 1].name : ''; };
  const commit = (type, pts) => { const m = { id: uid(), page: pg, type, pts, name: type === 'note' ? '' : lastName(type), note: '', at: new Date().toISOString() }; change(d => ({ ...d, items: [...d.items, m] })); setSel(m.id); return m; };

  /* gestures: one finger drags the plan, two fingers pinch; a tap (no movement) uses the tool */
  const toPage = (cx, cy) => { const r = vpRef.current.getBoundingClientRect(); return [(cx - r.left - view.x) / view.z, (cy - r.top - view.y) / view.z]; };
  function down(e) {
    vpRef.current.setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, [e.clientX, e.clientY]);
    const P = [...ptrs.current.values()];
    if (P.length === 2) { const mid = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2]; gest.current = { pinch: true, d0: dist(P[0], P[1]), mid0: mid, v0: view, moved: true }; }
    else if (P.length === 1) gest.current = { start: [e.clientX, e.clientY], v0: view, moved: false };
  }
  function move(e) {
    if (!ptrs.current.has(e.pointerId) || !gest.current) return;
    ptrs.current.set(e.pointerId, [e.clientX, e.clientY]);
    const g = gest.current, P = [...ptrs.current.values()], r = vpRef.current.getBoundingClientRect();
    if (g.pinch && P.length >= 2) {
      const d = dist(P[0], P[1]), mid = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
      const z = Math.min(12, Math.max(0.05, g.v0.z * d / (g.d0 || 1)));
      const px = (g.mid0[0] - r.left - g.v0.x) / g.v0.z, py = (g.mid0[1] - r.top - g.v0.y) / g.v0.z;
      setView({ z, x: mid[0] - r.left - px * z, y: mid[1] - r.top - py * z });
    } else if (!g.pinch) {
      const dx = e.clientX - g.start[0], dy = e.clientY - g.start[1];
      if (!g.moved && Math.hypot(dx, dy) > 7) g.moved = true;
      if (g.moved) setView({ ...g.v0, x: g.v0.x + dx, y: g.v0.y + dy });
    }
  }
  function up(e) {
    const g = gest.current; ptrs.current.delete(e.pointerId);
    if (ptrs.current.size === 0) { gest.current = null; if (g && !g.moved && !g.pinch && size) tap(toPage(e.clientX, e.clientY)); }
    else if (g && g.pinch) gest.current = { pinch: true, moved: true, v0: view, d0: 1, mid0: [0, 0], done: true };
  }
  function wheel(e) {
    e.preventDefault(); const r = vpRef.current.getBoundingClientRect();
    const z = Math.min(12, Math.max(0.05, view.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const px = (e.clientX - r.left - view.x) / view.z, py = (e.clientY - r.top - view.y) / view.z;
    setView({ z, x: e.clientX - r.left - px * z, y: e.clientY - r.top - py * z });
  }
  useEffect(() => { const el = vpRef.current; if (!el) return; el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel); });
  const zoomBy = f => { const r = vpRef.current.getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2; const z = Math.min(12, Math.max(0.05, view.z * f)); const px = (cx - view.x) / view.z, py = (cy - view.y) / view.z; setView({ z, x: cx - px * z, y: cy - py * z }); };

  function tap(p) {
    if (p[0] < 0 || p[1] < 0 || p[0] > size.w || p[1] > size.h) return;
    if (tool === 'move') {   /* tap a measurement to open it */
      const tol = 16 / view.z; let best = null, bd = tol;
      pageItems.forEach(m => m.pts.forEach(q => { const d = dist(p, q); if (d < bd) { bd = d; best = m; } }));
      setSel(best ? best.id : null); return;
    }
    if (tool === 'note') { commit('note', [p]); setTool('move'); return; }
    if (tool === 'count') {
      const cur = doc.items.find(m => m.id === countId && m.page === pg);
      if (cur) { upd(cur.id, { pts: [...cur.pts, p] }); setSel(cur.id); } else { const m = commit('count', [p]); setCountId(m.id); }
      return;
    }
    const np = [...pend, p];
    if (tool === 'scale') { setPend(np); if (np.length === 2) setPanel('scale'); return; }
    if ((tool === 'line' || tool === 'rect') && np.length === 2) { commit(tool, np); setPend([]); return; }
    setPend(np);
  }
  function finishArea() { if (pend.length >= 3) { commit('area', pend); setPend([]); } }
  function pickTool(k) { setTool(k); setPend([]); setCountId(null); if (k === 'scale') { setPanel('scale'); setSel(null); } else if (panel === 'scale') setPanel(''); if (k !== 'move') setSel(null); }
  function setScale(v, label) {
    if (!(v > 0)) return;
    change(d => { const pages = { ...d.pages }; const list = allPages ? Array.from({ length: numPages }, (_, i) => i + 1) : [pg];
      list.forEach(n => { if (n === pg || !pages[n]) pages[n] = { ppf: v, label }; }); return { ...d, pages }; });
    setPanel(''); setPend([]); setTool('line'); setKnownLen('');
  }
  function knownApply() { const ft = parseFeet(knownLen); if (pend.length === 2 && ft) setScale(dist(pend[0], pend[1]) / ft, (Math.round(ft * 100) / 100) + "' known"); }

  function exportCSV() {
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = [['Plan', 'Page', 'Type', 'Name', 'Qty', 'Unit', 'Perimeter LF', 'Height ft', 'Wall SF', 'Depth in', 'CY', 'Note']];
    doc.items.forEach(m => { const x = qty(m, doc.pages[m.page]?.ppf); const main = m.type === 'line' ? [x.lf, 'LF'] : m.type === 'count' ? [x.ea, 'EA'] : m.type === 'note' ? ['', 'note'] : [x.sf, 'SF'];
      rows.push([file.name, m.page, m.type, m.name || '', main[0] != null && main[0] !== '' ? Math.round(main[0] * 100) / 100 : '', main[1], m.type === 'rect' || m.type === 'area' ? (x.lf ? x.lf.toFixed(2) : '') : '', m.height || '', x.wallSf ? x.wallSf.toFixed(2) : '', m.depth || '', x.cy ? x.cy.toFixed(2) : '', m.type === 'note' ? m.text || '' : m.note || '']); });
    rows.push([]); rows.push(['TOTALS']); totals(doc).forEach(r => rows.push(['', '', '', r.name, Math.round(r.qty * 100) / 100, r.unit]));
    const url = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'takeoff-' + file.name.replace(/\.[a-z0-9]+$/i, '') + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  /* drawing (SVG over the page; line widths and labels stay the same size at any zoom) */
  const z = view.z, sw = 2.5 / z, rr = 6 / z, fs = 13 / z;
  const label = (x, y, txt, col, key) => <text key={key} x={x} y={y} fontSize={fs} fontWeight="700" fill={C.text} stroke="#fff" strokeWidth={4 / z} paintOrder="stroke" textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: 'none' }}>{txt}</text>;
  function shape(m) {
    const col = COLORS[m.type], on = m.id === sel, q = qty(m, ppf), w = on ? sw * 1.8 : sw;
    const cx = m.pts.reduce((s, p) => s + p[0], 0) / m.pts.length, cy = m.pts.reduce((s, p) => s + p[1], 0) / m.pts.length;
    const nm = m.name ? m.name + ' · ' : '';
    if (m.type === 'note') { const [x, y] = m.pts[0]; return <g key={m.id} data-mitem={m.id}><circle cx={x} cy={y} r={rr * 1.6} fill={on ? C.navy : '#FDE68A'} stroke={C.navy} strokeWidth={sw * 0.6} /><text x={x} y={y} fontSize={fs} textAnchor="middle" dominantBaseline="central" style={{ pointerEvents: 'none' }}>📝</text>{(m.text || '').trim() && label(x, y - rr * 3.2, (m.text || '').slice(0, 40), col, 't')}</g>; }
    if (m.type === 'count') return <g key={m.id} data-mitem={m.id}>{m.pts.map((p, i) => <g key={i}><circle cx={p[0]} cy={p[1]} r={rr * 1.3} fill={col} fillOpacity="0.85" stroke="#fff" strokeWidth={sw * 0.5} /><text x={p[0]} y={p[1]} fontSize={fs * 0.8} fill="#fff" fontWeight="800" textAnchor="middle" dominantBaseline="central" style={{ pointerEvents: 'none' }}>{i + 1}</text></g>)}{label(m.pts[0][0], m.pts[0][1] - rr * 3, nm + m.pts.length + ' EA', col, 'l')}</g>;
    if (m.type === 'line') { const pts = m.pts.map(p => p.join(',')).join(' '); return <g key={m.id} data-mitem={m.id}><polyline points={pts} fill="none" stroke={col} strokeWidth={w} />{m.pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={rr * 0.7} fill={col} />)}{label(cx, cy - rr * 1.6, nm + (ppf ? fmt(q.lf, 'LF') : t.needScale), col, 'l')}</g>; }
    const r = ring(m), pts = r.map(p => p.join(',')).join(' ');
    return <g key={m.id} data-mitem={m.id}><polygon points={pts} fill={col} fillOpacity="0.16" stroke={col} strokeWidth={w} />{label(cx, cy, nm + (ppf ? fmt(q.sf, 'SF') : t.needScale), col, 'l')}</g>;
  }
  const hint = { line: t.tapLine, rect: t.tapRect, area: t.tapArea, count: t.tapCount, note: t.tapNote, scale: pend.length ? t.tapScale2 : t.tapScale }[tool];
  const tot = totals(doc);
  const btn = (on, extra) => ({ border: `1px solid ${on ? C.navy : C.line}`, background: on ? C.navy : '#fff', color: on ? '#fff' : C.text, borderRadius: 10, padding: '8px 10px', fontSize: 14, fontWeight: 700, minHeight: 44, cursor: 'pointer', whiteSpace: 'nowrap', ...(extra || {}) });
  const inp = { width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px 10px', fontSize: 16, background: '#fff', color: C.text };
  const names = [...new Set(doc.items.map(m => m.name).filter(Boolean))];

  return (
    <div data-measure-tool="1" style={{ position: 'fixed', inset: 0, zIndex: 3000, background: '#fff', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', system-ui, sans-serif", color: C.text }}>
      {/* top: close · name · page · scale · saved */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
        <button type="button" data-m-close="1" onClick={onClose} style={btn(false, { padding: '6px 10px' })}>✕ {t.close}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📐 {file.name}</div>
          <div style={{ fontSize: 12, color: C.mute }} data-m-save={save}>{save === 'saved' ? t.saved : save === 'saving' ? t.saving : save === 'err' ? t.saveErr : (staff ? t.staff : t.private)}</div>
        </div>
        {numPages > 1 && <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" aria-label="previous page" disabled={pg <= 1} onClick={() => setPg(pg - 1)} style={btn(false, { padding: '6px 10px', opacity: pg <= 1 ? 0.4 : 1 })}>‹</button>
          <span data-m-page={pg} style={{ fontSize: 13, fontWeight: 700 }}>{pg}/{numPages}</span>
          <button type="button" aria-label="next page" disabled={pg >= numPages} onClick={() => setPg(pg + 1)} style={btn(false, { padding: '6px 10px', opacity: pg >= numPages ? 0.4 : 1 })}>›</button>
        </div>}
        <button type="button" data-m-scalechip="1" onClick={() => pickTool('scale')} style={btn(false, { padding: '6px 10px', fontSize: 13, borderColor: ppf ? C.line : C.gold, background: ppf ? '#fff' : '#FFF7E0' })}>{ppf ? `${t.scale}: ${doc.pages[pg].label || ''}` : t.noScale}</button>
      </div>

      {/* the plan */}
      <div ref={vpRef} data-m-viewport="1" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{ position: 'relative', flex: 1, overflow: 'hidden', background: C.bg, touchAction: 'none', cursor: tool === 'move' ? 'grab' : 'crosshair', userSelect: 'none' }}>
        {err ? <div style={{ padding: 30, textAlign: 'center', color: C.red, fontWeight: 700 }}>{err}</div> : !size && <div style={{ padding: 30, textAlign: 'center', color: C.mute }}>{t.loading}</div>}
        <div style={{ position: 'absolute', left: 0, top: 0, width: size ? size.w : 1, height: size ? size.h : 1, transform: `translate(${view.x}px, ${view.y}px) scale(${z})`, transformOrigin: '0 0', visibility: size ? 'visible' : 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,.15)', background: '#fff' }}>
          {pdf ? <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} /> : imgSrc && <img src={imgSrc} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block' }} />}
          {size && <svg viewBox={`0 0 ${size.w} ${size.h}`} width={size.w} height={size.h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
            {pageItems.map(shape)}
            {pend.length > 0 && <g>{pend.length > 1 && <polyline points={pend.map(p => p.join(',')).join(' ')} fill="none" stroke={tool === 'scale' ? C.red : C.navy} strokeWidth={sw} strokeDasharray={`${6 / z} ${4 / z}`} />}{pend.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={rr} fill={tool === 'scale' ? C.red : C.navy} />)}</g>}
          </svg>}
        </div>
        <div onPointerDown={e => e.stopPropagation()} style={{ position: 'absolute', right: 8, top: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="button" aria-label="zoom in" data-m-zoomin="1" onClick={() => zoomBy(1.4)} style={btn(false, { width: 44, padding: 0, fontSize: 20 })}>+</button>
          <button type="button" aria-label="zoom out" onClick={() => zoomBy(1 / 1.4)} style={btn(false, { width: 44, padding: 0, fontSize: 20 })}>−</button>
          <button type="button" onClick={fit} style={btn(false, { width: 44, padding: 0, fontSize: 11 })}>{t.fit}</button>
        </div>
        {hint && <div onPointerDown={e => e.stopPropagation()} style={{ position: 'absolute', left: 8, top: 8, right: 60, background: 'rgba(255,255,255,.95)', border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 10px', fontSize: 13, fontWeight: 600 }} data-m-hint="1">
          {hint}{tool === 'area' && pend.length >= 3 && <button type="button" data-m-finish="1" onClick={finishArea} style={btn(true, { marginLeft: 8, minHeight: 34, padding: '4px 10px' })}>{t.finish}</button>}
          {tool === 'count' && countId && <button type="button" onClick={() => { setCountId(null); setTool('move'); }} style={btn(true, { marginLeft: 8, minHeight: 34, padding: '4px 10px' })}>{t.finishCount}</button>}
        </div>}
      </div>

      {/* the panel: scale · the open measurement · the list */}
      {panel === 'scale' && <div data-m-scalepanel="1" style={{ borderTop: `1px solid ${C.line}`, padding: 10, maxHeight: '45vh', overflow: 'auto' }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>{t.presets}</div>
        {pdf ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{PRESETS.map(([lb, v]) => <button type="button" key={lb} data-m-preset={lb} onClick={() => setScale(v, lb)} style={btn(doc.pages[pg]?.label === lb, { minHeight: 40, padding: '6px 10px' })}>{lb}</button>)}</div>
          : <div style={{ fontSize: 13, color: C.mute }}>{t.imgNoPreset}</div>}
        <div style={{ fontWeight: 800, margin: '10px 0 4px' }}>{t.known}</div>
        <div style={{ fontSize: 13, color: C.mute, marginBottom: 6 }}>{pend.length === 2 ? '✓ ' + dist(pend[0], pend[1]).toFixed(0) + ' px' : t.knownHint}</div>
        {pend.length === 2 && <div style={{ display: 'flex', gap: 6 }}><input data-m-knownlen="1" inputMode="decimal" style={inp} placeholder={t.knownLen} value={knownLen} onChange={e => setKnownLen(e.target.value)} />
          <button type="button" data-m-knownset="1" disabled={!parseFeet(knownLen)} onClick={knownApply} style={btn(true)}>{t.apply}</button></div>}
        {numPages > 1 && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, marginTop: 8 }}><input type="checkbox" checked={allPages} onChange={e => setAllPages(e.target.checked)} /> {t.allPages}</label>}
        <button type="button" onClick={() => { setPanel(''); setPend([]); setTool('move'); }} style={btn(false, { marginTop: 8 })}>{t.cancel}</button>
      </div>}

      {panel !== 'scale' && panel !== 'list' && selItem && <div data-m-editor={selItem.id} style={{ borderTop: `2px solid ${COLORS[selItem.type]}`, padding: 10, maxHeight: '42vh', overflow: 'auto' }}>
        {(() => { const q = qty(selItem, doc.pages[selItem.page]?.ppf); const parts = selItem.type === 'line' ? [q.lf && fmt(q.lf, 'LF'), q.wallSf && fmt(q.wallSf, 'SF wall')] : selItem.type === 'count' ? [fmt(q.ea, 'EA')] : selItem.type === 'note' ? [] : [q.sf && fmt(q.sf, 'SF'), q.lf && fmt(q.lf, 'LF perimeter'), q.cy && fmt(q.cy, 'CY')];
          return <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }} data-m-qty="1">{t[selItem.type === 'rect' ? 'rect' : selItem.type]} {parts.filter(Boolean).join(' · ') || (selItem.type !== 'note' && !ppf ? '— ' + t.noScale : '')}</div>; })()}
        {selItem.type === 'note'
          ? <textarea data-m-notetext="1" rows={2} style={inp} placeholder={t.noteText} value={selItem.text || ''} onChange={e => upd(selItem.id, { text: e.target.value })} />
          : <>
            <input data-m-name="1" list="m-names" style={inp} placeholder={t.name} value={selItem.name || ''} onChange={e => upd(selItem.id, { name: e.target.value })} />
            <datalist id="m-names">{names.map(n => <option key={n} value={n} />)}</datalist>
            {selItem.type === 'line' && <input data-m-height="1" inputMode="decimal" style={{ ...inp, marginTop: 6 }} placeholder={t.height} value={selItem.height || ''} onChange={e => upd(selItem.id, { height: parseFloat(e.target.value) || '' })} />}
            {(selItem.type === 'rect' || selItem.type === 'area') && <input data-m-depth="1" inputMode="decimal" style={{ ...inp, marginTop: 6 }} placeholder={t.depth} value={selItem.depth || ''} onChange={e => upd(selItem.id, { depth: parseFloat(e.target.value) || '' })} />}
            <textarea data-m-note="1" rows={2} style={{ ...inp, marginTop: 6 }} placeholder={t.noteL} value={selItem.note || ''} onChange={e => upd(selItem.id, { note: e.target.value })} />
          </>}
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button type="button" data-m-done="1" onClick={() => setSel(null)} style={btn(true, { flex: 1 })}>{t.done}</button>
          <button type="button" data-m-del="1" onClick={() => del(selItem.id)} style={btn(false, { color: C.red })}>🗑 {t.del}</button>
        </div>
      </div>}

      {panel === 'list' && <div data-m-list="1" style={{ borderTop: `1px solid ${C.line}`, padding: 10, maxHeight: '50vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><b style={{ flex: 1 }}>{t.totals}</b>
          <button type="button" data-m-csv="1" disabled={!doc.items.length} onClick={exportCSV} style={btn(false, { minHeight: 36, padding: '4px 10px' })}>{t.csv}</button>
          <button type="button" onClick={() => setPanel('')} style={btn(false, { minHeight: 36, padding: '4px 10px' })}>✕</button></div>
        {!tot.length && <div style={{ color: C.mute, fontSize: 14 }}>{t.none}</div>}
        {tot.map(r => <div key={r.name + r.unit} data-m-total={r.name + '|' + r.unit} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.line}`, fontSize: 15 }}><span>{r.name}</span><b>{fmt(r.qty, r.unit)}</b></div>)}
        {doc.items.length > 0 && <div style={{ fontWeight: 800, margin: '12px 0 4px' }}>{t.items}</div>}
        {doc.items.map(m => { const q = qty(m, doc.pages[m.page]?.ppf); const main = m.type === 'line' ? q.lf && fmt(q.lf, 'LF') : m.type === 'count' ? fmt(q.ea, 'EA') : m.type === 'note' ? '' : q.sf && fmt(q.sf, 'SF');
          return <div key={m.id} data-m-row={m.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.line}` }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[m.type], flex: 'none' }} />
            <button type="button" onClick={() => { setPanel(''); setTool('move'); if (m.page !== pg) setPg(m.page); setTimeout(() => setSel(m.id), 0); }} style={{ flex: 1, textAlign: 'left', background: 'none', border: 0, padding: 0, fontSize: 14, color: C.text, cursor: 'pointer' }}>
              <b>{m.type === 'note' ? '📝 ' + (m.text || '').slice(0, 60) : (m.name || DEF[m.type])}</b>{main ? ' · ' + main : ''}<span style={{ color: C.mute }}> · {t.page} {m.page}</span>{m.note ? <div style={{ color: C.mute, fontSize: 12 }}>{m.note}</div> : null}</button>
            <button type="button" aria-label="delete" onClick={() => del(m.id)} style={btn(false, { minHeight: 36, padding: '4px 10px', color: C.red })}>🗑</button></div>; })}
      </div>}

      {/* the tools */}
      <div data-m-tools="1" style={{ display: 'flex', gap: 6, padding: '8px 8px calc(8px + env(safe-area-inset-bottom))', borderTop: `1px solid ${C.line}`, overflowX: 'auto', background: '#fff' }}>
        {[['move', '✋'], ['line', '📏'], ['rect', '▭'], ['area', '⬡'], ['count', '⊕'], ['note', '📝'], ['scale', '📐']].map(([k, ic]) =>
          <button type="button" key={k} data-m-tool={k} onClick={() => pickTool(k)} style={btn(tool === k)}>{ic} {k === 'scale' ? t.setScale : t[k]}</button>)}
        <button type="button" data-m-tool="list" onClick={() => { setPanel(panel === 'list' ? '' : 'list'); setSel(null); }} style={btn(panel === 'list')}>☰ {t.list} ({doc.items.length})</button>
      </div>
    </div>
  );
}

/* the bid site opened from portal.grayco-cs.com: #measure=<ticket> (no bid-site sign-in) */
export function MeasureFromPortal({ ticket, lang }) {
  const [f, setF] = useState(null), [err, setErr] = useState(''), [closed, setClosed] = useState(false);
  useEffect(() => { api('takeoffs', { op: 'open', mt: ticket }, { anonymous: true }).then(r => setF(r), e => setErr(e.message || 'This measure link could not be opened.')); }, [ticket]);
  const box = { maxWidth: 420, margin: '60px auto', padding: 20, textAlign: 'center', fontFamily: "'Inter', system-ui, sans-serif", color: C.text };
  if (err) return <div style={box} data-m-err="1"><b>{err}</b><p><a href="https://portal.grayco-cs.com/">portal.grayco-cs.com</a></p></div>;
  if (closed) return <div style={box} data-m-closed="1"><b>{lang === 'es' ? 'Su medición está guardada.' : 'Your takeoff is saved.'}</b><p>{lang === 'es' ? 'Puede cerrar esta pestaña.' : 'You can close this tab.'}</p>
    <p><button type="button" onClick={() => setClosed(false)} style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.navy}`, background: '#fff', fontWeight: 700 }}>📐 {lang === 'es' ? 'Abrir otra vez' : 'Open it again'}</button></p></div>;
  if (!f) return <div style={box}>…</div>;
  return <MeasureTool file={f.file} mt={ticket} lang={lang} onClose={() => { setClosed(true); try { window.close(); } catch (e) {} }} />;
}
