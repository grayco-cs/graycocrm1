/**
 * ============================================================
 *  GrayCo Portal — records and files
 * ============================================================
 *
 *  Same sget / sset / sdel shape the app was written against, but every call
 *  goes to the portal's server function (netlify/functions/subportal.js), which
 *  decides what this person may read and write.
 *
 *  Lists ('users', 'jobs', 'bids', 'estimates', 'activity', 'messages',
 *  'invites', 'links'): the app hands over the whole list; only what changed
 *  since the last load or save is sent (new / changed records, and records the
 *  app removed). So two people working at once never wipe out each other's
 *  new records.
 *
 *  Single records: 'plans:{jobId}', 'subdocs:{userId}',
 *  'takeoff:{userId}:{jobId}:{planName}', 'bid-draft:{jobId}:{userId}'.
 *
 *  Files: any record with a `dataUrl` that holds a picked file ("data:…") is
 *  uploaded to the private bucket first and saved as a `fileRef`. When records
 *  come back, the server puts a short-lived signed link in `dataUrl`, so the
 *  app's existing "open / download" code keeps working.
 * ============================================================
 */

import { api } from './auth.js';
import { SB_ANON } from './config.js';

export const COLLECTIONS = ['users', 'jobs', 'bids', 'estimates', 'activity', 'messages', 'invites', 'links', 'questions', 'acks'];   // patch SYS2: acks = "I acknowledge addendum #n"

const baselines = new Map();   // list key → Map(id → JSON of the saved form)
const lastSingle = new Map();  // single-record key → JSON last saved / loaded
const queues = new Map();      // key → promise of the save in progress (saves to one key run in order)
const uploaded = new Map();    // "data:…" string → fileRef (a file is uploaded once)
let saveGen = 0;
let pending = 0;

// ---- saved form -----------------------------------------------------------

// Without the signed link and the server's extra fields: what the database holds.
function savedForm(v) {
  if (Array.isArray(v)) return v.map(savedForm);
  if (!v || typeof v !== 'object') return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (x === undefined) continue;
    if (k === 'dataUrl' && v.fileRef && typeof x === 'string' && !x.startsWith('data:')) continue;
    if (k === '_rank' || k === '_total' || k === '_amounts') continue;
    out[k] = (x && typeof x === 'object') ? savedForm(x) : x;
  }
  return out;
}

function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const type = m[1] || 'application/octet-stream';
  if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type });
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * Upload one file (a File/Blob) to the private bucket. Returns its fileRef.
 */
export async function uploadBlob(blob, name) {
  const type = blob.type || 'application/octet-stream';
  const up = await api('upload', { name: name || 'file', type, size: blob.size });
  let r;
  try {
    r = await fetch(up.url, { method: 'PUT', headers: { apikey: SB_ANON, 'Content-Type': type, 'x-upsert': 'false' }, body: blob });
  } catch (e) {
    throw new Error('The file could not be uploaded. Check the internet connection.');
  }
  if (!r.ok) throw new Error('The file could not be uploaded (' + r.status + ').');
  return up.path;
}

/**
 * Upload a picked file given as a "data:" URL (what the app reads files into). Once per file.
 */
export async function uploadDataUrl(dataUrl, name) {
  if (uploaded.has(dataUrl)) return uploaded.get(dataUrl);
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) throw new Error('That file could not be read.');
  const ref = await uploadBlob(blob, name);
  uploaded.set(dataUrl, ref);
  return ref;
}

// Upload every picked file inside `v`, and return the saved form with fileRefs in their place.
async function prepare(v) {
  if (Array.isArray(v)) { const out = []; for (const x of v) out.push(await prepare(x)); return out; }
  if (!v || typeof v !== 'object') return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (x === undefined) continue;
    out[k] = (x && typeof x === 'object') ? await prepare(x) : x;
  }
  if (typeof v.dataUrl === 'string' && v.dataUrl.startsWith('data:')) {
    out.fileRef = await uploadDataUrl(v.dataUrl, v.name || v.fileName || v.label || 'file');
    delete out.dataUrl;
  }
  return savedForm(out);
}

// ---- reading ----------------------------------------------------------------

function remember(key, value) {
  if (COLLECTIONS.includes(key)) {
    const m = new Map();
    (value || []).forEach(x => { if (x && x.id) m.set(x.id, JSON.stringify(savedForm(x))); });
    baselines.set(key, m);
  } else if (!key.endsWith(':*')) {
    lastSingle.set(key, JSON.stringify(savedForm(value == null ? null : value)));
  }
}

/**
 * Load several keys in one trip. Returns { key: value }.
 */
export async function sloadMany(keys) {
  const { data } = await api('load', { keys });
  for (const k of keys) remember(k, data[k]);
  return data;
}

export async function sget(key) {
  try {
    const data = await sloadMany([key]);
    return data[key];
  } catch (e) {
    console.warn('sget failed for', key, e.message || e);
    return null;
  }
}

/** A number that changes whenever a save starts — a refresh that overlapped a save is thrown away. */
export function saveGeneration() { return saveGen; }
export function savesPending() { return pending > 0; }

// ---- writing ----------------------------------------------------------------

function enqueue(key, job) {
  saveGen++;
  pending++;
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(job).finally(() => { pending--; });
  queues.set(key, next);
  return next;
}

let onError = (msg) => console.error(msg);
/** The app shows save problems as a toast. */
export function setSaveErrorHandler(fn) { onError = fn; }

export function sset(key, value) {
  return enqueue(key, async () => {
    try {
      if (COLLECTIONS.includes(key)) {
        const base = baselines.get(key);
        if (!base) return true;   // never loaded (signed out, or not this person's list)
        const prepared = await prepare(value || []);
        const now = new Map();
        const upsert = [];
        prepared.forEach(x => {
          if (!x || !x.id) return;
          const json = JSON.stringify(x);
          now.set(x.id, json);
          if (base.get(x.id) !== json) upsert.push(x);
        });
        const del = [...base.keys()].filter(id => !now.has(id));
        if (!upsert.length && !del.length) return true;
        await api('save', { key, upsert, del });
        baselines.set(key, now);
        return true;
      }
      const prepared = await prepare(value == null ? null : value);
      const json = JSON.stringify(prepared);
      if (lastSingle.get(key) === json) return true;
      await api('save', { key, value: prepared });
      lastSingle.set(key, json);
      return true;
    } catch (e) {
      console.error('save failed for', key, e);
      onError(e.message || 'Could not save. Try again.');
      return false;
    }
  });
}

export function sdel(key) {
  if (COLLECTIONS.includes(key)) return Promise.resolve(false);
  return sset(key, null);
}

// ---- opening files ----------------------------------------------------------

/**
 * Open or download a file the app holds: a picked file ("data:…") downloads;
 * a stored file opens its signed link in a new tab.
 */
export function openFile(url, name) {
  if (!url) return false;
  const a = document.createElement('a');
  a.href = url;
  if (url.startsWith('data:') || url.startsWith('blob:')) a.download = name || 'file';
  else { a.target = '_blank'; a.rel = 'noopener'; }
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 0);
  return true;
}

/** Record what a load returned as the starting point for later saves (used by the timed refresh). */
export function rememberLoaded(keys, data) {
  for (const k of keys) remember(k, data[k]);
}
