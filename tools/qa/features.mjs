// features.mjs — the inventory of recently added features and the UI controls each one adds, from git history:
// every commit on <ref> since <since> whose subject starts with "NAME:" is a feature commit; the lines it added to
// index.html are mined for the controls it made (element ids, data-* hooks, button / tab labels).
// Usage (CLI): node tools/qa/features.mjs <repo> [--since 2026-10-29] [--ref origin/main] [--out features.json]
// The crawler (crawl.mjs) tags each button it taps with the feature(s) whose controls it matches.
import { execFileSync } from 'child_process'; import fs from 'fs';

const git = (repo, args) => execFileSync('git', ['-C', repo].concat(args), { encoding: 'utf8', maxBuffer: 1 << 30 });
const NOISE = /^(px|em|div|span|none|auto|true|false|null|undefined|function|return|var|let|const|this|else|style|class|button|block|flex|hidden|absolute|relative|fixed|center|left|right|top|bottom|bold|normal|inherit|solid|pointer|white|black|transparent|grid|inline|click|change|input|submit|ok|x)$/i;

export function inventory(repo, opt){
  opt = opt || {};
  const since = opt.since || '2026-10-29', ref = opt.ref || 'origin/main';
  const log = git(repo, ['log', '--since=' + since, '--format=%H%x09%ad%x09%s', '--date=short', ref]).trim().split('\n').filter(Boolean);
  const F = new Map();
  for (const l of log) {
    const [sha, date, subj] = l.split('\t'); const m = /^(?:r\d+[a-z]*:\s*)?([A-Z][A-Z0-9_]{2,})\b[:\s]/.exec(subj || ''); if (!m) continue;
    const name = m[1]; if (/^(WIP|QAA|QAB|QAC|QAFINAL|QAGATE|MERGE|REVERT)$/.test(name)) continue;
    const f = F.get(name) || { name, first: date, last: date, commits: [], summary: '', ids: new Set(), data: new Set(), labels: new Set() };
    if (date < f.first) { f.first = date; } if (date > f.last) f.last = date;
    if (!f.summary || date <= f.first) f.summary = subj.slice(subj.indexOf(name) + name.length + 1).trim().slice(0, 200);
    f.commits.push(sha.slice(0, 9)); F.set(name, f);
    let diff = ''; try { diff = git(repo, ['show', '--format=', '--unified=0', sha, '--', 'index.html', 'tools/*.js', 'tools/*.css', 'tools/*.py', ':!tools/tests', ':!tools/qa']); } catch (e) {}
    const added = diff.split('\n').filter(x => x.startsWith('+') && !x.startsWith('+++')).join('\n').replace(/\\(["'])/g, '$1');
    /* ids the feature CREATES (markup id="…", el.id = '…'), not ones it only looks up */
    for (const r of added.matchAll(/<[a-z]+\b[^<>]*?\bid\s*=\s*["']([A-Za-z_][\w-]{2,60})["']|\.id\s*=\s*["']([A-Za-z_][\w-]{2,60})["']/g)) { const v = r[1] || r[2]; if (!NOISE.test(v) && !/^gc-patch-/.test(v)) f.ids.add(v); }
    for (const r of added.matchAll(/\b(data-[a-z0-9-]{2,30})=["']([^"'<>\s]{1,40})["']/g)) f.data.add(r[1] + '=' + r[2]);
    for (const r of added.matchAll(/<(button|a|summary|label)\b[^>]*>([^<>]{2,48})<\/\1>/g)) { const t = norm(r[2]); if (t.length >= 2 && !/[{}$+]|=>/.test(r[2]) && !NOISE.test(t)) f.labels.add(t); }
    for (const r of added.matchAll(/(?:textContent|innerText)\s*=\s*["']([^"'<>]{2,40})["']/g)) { const t = norm(r[1]); if (t.length >= 2 && !NOISE.test(t)) f.labels.add(t); }
    for (const r of added.matchAll(/\b(?:label|text|title)\s*:\s*["']([^"'<>]{2,40})["']/g)) { const t = norm(r[1]); if (/[\p{Emoji_Presentation}A-Z]/u.test(r[1]) && !NOISE.test(t)) f.labels.add(t); }
  }
  return [...F.values()].map(f => ({ name: f.name, first: f.first, last: f.last, summary: f.summary, commits: f.commits.length, ids: [...f.ids].slice(0, 300), data: [...f.data].slice(0, 300), labels: [...f.labels].slice(0, 300) }))
    .sort((a, b) => b.last.localeCompare(a.last));
}
export function norm(s){ return String(s || '').replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(); }

/* which features does one crawled control belong to? (the control's own id / data hooks / label, and its ancestors' ids) */
const GENERIC = /^(\W*\s*)?(close|back|done|cancel|save|ok|yes|no|add|copy|open|remove|delete|edit|send|next|prev|more|refresh|retry|undo|apply|clear|search|filter|today|all|none|new|view|help|settings|jobs|home|‹ ?jobs|‹ ?back|not now|later|details|loading…?)$/i;
export function matcher(features){
  const byId = new Map(), byData = new Map(), byLabel = new Map();
  const add = (M, k, n) => { if (!M.has(k)) M.set(k, new Set()); M.get(k).add(n); };
  for (const f of features) { f.ids.forEach(i => add(byId, i, f.name)); f.data.forEach(d => add(byData, d, f.name)); f.labels.forEach(l => { if (l.replace(/[^\p{L}\p{N}]/gu, '').length >= 4 && !GENERIC.test(l)) add(byLabel, l, f.name); }); }
  /* a hook several features touch (a shared container, a common word) says nothing about which feature a button is */
  const specific = M => { for (const [k, v] of M) if (v.size > 2) M.delete(k); };
  specific(byId); specific(byData); specific(byLabel);
  return c => { const out = new Set();
    (c.ids || []).slice(0, 2).forEach(i => (byId.get(i) || []).forEach(n => out.add(n)));
    (c.data || []).forEach(d => (byData.get(d) || []).forEach(n => out.add(n)));
    const t = norm(c.text); if (t) (byLabel.get(t) || []).forEach(n => out.add(n));
    return [...out]; };
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const a = process.argv.slice(2); const o = n => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : undefined; };
  const inv = inventory(a[0] || '.', { since: o('since'), ref: o('ref') });
  const s = JSON.stringify(inv, null, 1); if (o('out')) fs.writeFileSync(o('out'), s); else console.log(s);
  console.error(inv.length + ' features; ' + inv.reduce((n, f) => n + f.ids.length + f.data.length + f.labels.length, 0) + ' control hooks');
}
