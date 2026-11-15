/* patch SCOPEVER (owner's sub portal plan, 11/15 list item 5.1b): what changed between two versions of a sub scope — words only
   (never a price): lines added / taken out / changed (qty, unit, area, note), and the included / not included / notes / dates text.
   The same rule runs in the CRM (index.html patch SCOPEVER, window._gcScopeDiff) for scopes sent as job messages. */
'use strict';
function s(v){ return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function key(l){ return s(l.desc || l.description).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function q(l){ const v = l.qty; return v === '' || v == null ? '' : String(+v === +v ? +v : v); }
function clip(t, n){ t = s(t); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
/* prev / cur: { lines: [{ room|area|sec, desc, qty, unit, meas|note }], included, excluded, notes, start, end } */
function diff(prev, cur){
  prev = prev || {}; cur = cur || {};
  const A = {}, B = {}, out = { added: [], removed: [], changed: [], other: [] };
  arr(prev.lines).forEach(l => { const k = key(l); if (k && !A[k]) A[k] = l; });
  arr(cur.lines).forEach(l => { const k = key(l); if (k && !B[k]) B[k] = l; });
  Object.keys(B).forEach(k => {
    const b = B[k], a = A[k], d = clip(b.desc || b.description, 120);
    if (!a) { out.added.push(d + (q(b) ? ' — ' + q(b) + (s(b.unit) ? ' ' + s(b.unit) : '') : '')); return; }
    const ch = [];
    if (q(a) !== q(b) || s(a.unit) !== s(b.unit)) ch.push('qty ' + (q(a) || '—') + (s(a.unit) ? ' ' + s(a.unit) : '') + ' → ' + (q(b) || '—') + (s(b.unit) ? ' ' + s(b.unit) : ''));
    const ar = s(a.room || a.area || a.sec), br = s(b.room || b.area || b.sec); if (ar !== br) ch.push('area ' + (ar || '—') + ' → ' + (br || '—'));
    const an = s(a.meas || a.note || a.measurement), bn = s(b.meas || b.note || b.measurement); if (an !== bn) ch.push('note changed');
    if (ch.length) out.changed.push(d + ': ' + ch.join(', '));
  });
  Object.keys(A).forEach(k => { if (!B[k]) out.removed.push(clip(A[k].desc || A[k].description, 120)); });
  [['included', 'What is included'], ['excluded', 'What is not included'], ['notes', 'Notes'], ['matGc', 'Materials GrayCo supplies'], ['matSub', 'Materials you supply']].forEach(f => { if (s(prev[f[0]]) !== s(cur[f[0]])) out.other.push(f[1] + ' changed'); });
  if (s(prev.start) !== s(cur.start) || s(prev.end) !== s(cur.end)) out.other.push('Dates changed');
  ['added', 'removed', 'changed', 'other'].forEach(k => { out[k] = out[k].slice(0, 40); });
  out.any = !!(out.added.length || out.removed.length || out.changed.length || out.other.length);
  return out;
}
/* the same as plain lines for a message */
function text(c, from, to){
  if (!c || !c.any) return '';
  const L = ['🔄 Scope updated' + (from && to ? ' (v' + from + ' → v' + to + ')' : '') + ' — what changed:'];
  c.added.forEach(x => L.push('+ Added: ' + x)); c.removed.forEach(x => L.push('− Taken out: ' + x)); c.changed.forEach(x => L.push('~ Changed: ' + x)); c.other.forEach(x => L.push('~ ' + x));
  return L.join('\n');
}
module.exports = { diff, text };
