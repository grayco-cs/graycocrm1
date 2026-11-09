// PlanBuilder saving: projects and the company catalog live in this browser (localStorage)
// and can be exported / imported as files. (Shared saving through the CRM is the next phase: see ROADMAP.md.)

import { DEFAULT_CATALOG } from './catalog.js';
import { normalize } from './model.js';

const K_INDEX = 'pb.projects.v1';
const K_PRJ = id => 'pb.project.v1.' + id;
const K_CAT = 'pb.catalog.v1';
const K_LAST = 'pb.last.v1';

function get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function put(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch (e) { console.warn('Save failed', e); return false; }
}

export function listProjects() { return get(K_INDEX, []).sort((a, b) => String(b.updated).localeCompare(String(a.updated))); }
export function loadProject(id) { const p = get(K_PRJ(id), null); return p ? normalize(p) : null; }
export function saveProject(p) {
  p.updated = new Date().toISOString();
  const ok = put(K_PRJ(p.id), p);
  if (!ok) return false;
  const idx = get(K_INDEX, []).filter(x => x.id !== p.id);
  idx.push({ id: p.id, name: p.name, type: p.type, client: p.client, address: p.address, claimNo: p.claimNo, updated: p.updated });
  put(K_INDEX, idx);
  put(K_LAST, p.id);
  return true;
}
export function deleteProject(id) {
  try { localStorage.removeItem(K_PRJ(id)); } catch (e) { /* ignore */ }
  put(K_INDEX, get(K_INDEX, []).filter(x => x.id !== id));
}
export function lastProjectId() { return get(K_LAST, null); }

// The catalog: the defaults, with the company's own edits and additions saved over them.
export function loadCatalog() {
  const saved = get(K_CAT, null);
  if (!saved || !Array.isArray(saved) || !saved.length) return DEFAULT_CATALOG.map(p => ({ ...p }));
  // add any new default products that a newer version brought in (by id), keep every saved edit
  const ids = new Set(saved.map(p => p.id));
  return saved.concat(DEFAULT_CATALOG.filter(p => !ids.has(p.id) && !(get('pb.catalog.removed.v1', []) || []).includes(p.id)).map(p => ({ ...p })));
}
export function saveCatalog(cat) { return put(K_CAT, cat); }
export function markRemoved(id) { const r = get('pb.catalog.removed.v1', []); if (!r.includes(id)) { r.push(id); put('pb.catalog.removed.v1', r); } }
export function resetCatalog() { try { localStorage.removeItem(K_CAT); localStorage.removeItem('pb.catalog.removed.v1'); } catch (e) { /* ignore */ } return loadCatalog(); }

export function download(name, text, type = 'application/json') {
  const blob = text instanceof Blob ? text : new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export function pickFile(accept) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = () => res(i.files && i.files[0] || null);
    i.click();
  });
}
export function readText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(file); }); }
export function readDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); }); }

// Price lists (Xactimate exports, supplier lists): [{ id, name, kind, imported, count, hasMaterial, items }]
const K_BOOKS = 'pb.pricebooks.v1';
export function listBooks() { return get(K_BOOKS, []); }
export function saveBooks(b) { return put(K_BOOKS, b); }
export function getBook(id) { return listBooks().find(b => b.id === id) || null; }
