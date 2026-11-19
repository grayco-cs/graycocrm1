// lib_eml.mjs — a small MIME reader for the tests' .eml fixtures (multipart/alternative, quoted-printable / base64 / 7bit, UTF-8):
// returns { headers (lower-case names, unfolded), text, html } the way Resend's inbound API hands an e-mail to bid-inbox.js.
function unfold(h){ return h.replace(/\r?\n[ \t]+/g, ' '); }
function heads(block){ const o = {}; unfold(block).split(/\r?\n/).forEach(l => { const m = /^([^:\s]+):\s*(.*)$/.exec(l); if (m) o[m[1].toLowerCase()] = m[2]; }); return o; }
function qp(s){ const b = []; const t = s.replace(/=\r?\n/g, ''); for (let i = 0; i < t.length; i++) { if (t[i] === '=' && /^[0-9A-F]{2}$/i.test(t.substr(i + 1, 2))) { b.push(parseInt(t.substr(i + 1, 2), 16)); i += 2; } else b.push(...Buffer.from(t[i], 'utf8')); } return Buffer.from(b).toString('utf8'); }
function body(h, raw){ const te = String(h['content-transfer-encoding'] || '').toLowerCase(); if (te === 'quoted-printable') return qp(raw); if (te === 'base64') return Buffer.from(raw.replace(/\s+/g, ''), 'base64').toString('utf8'); return raw; }
export function parseEml(raw){
  const i = raw.search(/\r?\n\r?\n/), H = heads(raw.slice(0, i)), rest = raw.slice(i).replace(/^\r?\n\r?\n/, '');
  const out = { headers: H, text: '', html: '' };
  const bm = /boundary="?([^";]+)"?/i.exec(H['content-type'] || '');
  const parts = bm ? rest.split('--' + bm[1]).slice(1).filter(p => !/^--/.test(p)) : [null];
  parts.forEach(p => { let ph = H, pb = rest; if (p !== null) { const j = p.search(/\r?\n\r?\n/); ph = heads(p.slice(0, j)); pb = p.slice(j).replace(/^\r?\n\r?\n/, '').replace(/\r?\n$/, ''); }
    const ct = String(ph['content-type'] || 'text/plain').toLowerCase(); const v = body(ph, pb).replace(/\r\n/g, '\n');
    if (/text\/html/.test(ct) && !out.html) out.html = v; else if (/text\/plain/.test(ct) && !out.text) out.text = v; });
  return out;
}
