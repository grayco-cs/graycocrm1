#!/usr/bin/env python3
"""Idempotent patch MAILWHITE: the 📧 GrayCo Email Center (patch MAILC) gets the white look the rest of the CRM uses
(owner 11/1: "grayco email center tab needs to be white aesthetic not navy"). Only the colours of MAILC's own stylesheet
change; layout, buttons and behaviour stay the same. Usage: python3 tools/patch_MAILWHITE.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch MAILWHITE'
if MARK in t: print('MAILWHITE: already patched'); sys.exit(0)
old = """st.textContent = '.gcm-root{height:100%;overflow:auto;background:#0d1b2a;color:#e2e8f0;font:13px Inter,Arial,sans-serif;padding:16px;box-sizing:border-box}'
    + '.gcm-card{background:#13243a;border:1px solid #1e3a5f;border-radius:12px;padding:14px;margin:0 0 12px}'
    + '.gcm-h{font-size:18px;font-weight:800;color:#fff;margin:0 0 4px}.gcm-mut{color:#94a3b8;font-size:12px}'
    + '.gcm-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}'
    + '.gcm-chip{border:1px solid #1e3a5f;background:#0f1d30;color:#cbd5e1;border-radius:999px;padding:5px 10px;font:600 12px Inter,sans-serif;cursor:pointer;text-decoration:none;display:inline-flex;gap:6px;align-items:center}'
    + '.gcm-chip.on{border-color:#d4a017;color:#d4a017;background:#1b2b40}.gcm-chip .gcm-k{font-size:10px;opacity:.75}'
    + '.gcm-btns{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:10px}'
    + '.gcm-btn{display:block;text-align:center;border:1px solid #1e3a5f;background:#0f1d30;color:#e2e8f0;border-radius:8px;padding:9px 8px;font-weight:700;text-decoration:none}'
    + '.gcm-btn.gold{background:#d4a017;color:#0d1b2a;border-color:#d4a017}'
    + '.gcm-tbl{width:100%;border-collapse:collapse;margin-top:8px}.gcm-tbl td,.gcm-tbl th{border-bottom:1px solid #1e3a5f;padding:6px 6px;text-align:left;vertical-align:top;font-size:12px}'
    + '.gcm-tbl th{color:#94a3b8;font-weight:700}.gcm-tbl a{color:#93c5fd}'
    + '.gcm-in{background:#0f1d30;border:1px solid #1e3a5f;border-radius:8px;color:#e2e8f0;padding:7px 9px;font:13px Inter,sans-serif}'
    + '.gcm-ok{color:#86efac}.gcm-no{color:#fca5a5}';"""
new = MARK + """: the white look (owner 11/1) */
  st.textContent = '.gcm-root{height:100%;overflow:auto;background:#f6f7f9;color:#0f172a;font:13px Inter,Arial,sans-serif;padding:16px;box-sizing:border-box}'
    + '.gcm-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:0 0 12px;box-shadow:0 1px 2px rgba(15,23,42,.05)}'
    + '.gcm-h{font-size:18px;font-weight:800;color:#0f172a;margin:0 0 4px}.gcm-mut{color:#64748b;font-size:12px}'
    + '.gcm-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}'
    + '.gcm-chip{border:1px solid #d1d5db;background:#fff;color:#334155;border-radius:999px;padding:5px 10px;font:600 12px Inter,sans-serif;cursor:pointer;text-decoration:none;display:inline-flex;gap:6px;align-items:center}'
    + '.gcm-chip.on{border-color:#d4a017;color:#7a5800;background:#fff8e1}.gcm-chip .gcm-k{font-size:10px;opacity:.75}'
    + '.gcm-btns{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:10px}'
    + '.gcm-btn{display:block;text-align:center;border:1px solid #d1d5db;background:#fff;color:#0f172a;border-radius:8px;padding:9px 8px;font-weight:700;text-decoration:none}'
    + '.gcm-btn:hover{border-color:#94a3b8;background:#f8fafc}'
    + '.gcm-btn.gold{background:#d4a017;color:#1f2937;border-color:#d4a017}'
    + '.gcm-tbl{width:100%;border-collapse:collapse;margin-top:8px}.gcm-tbl td,.gcm-tbl th{border-bottom:1px solid #e5e7eb;padding:6px 6px;text-align:left;vertical-align:top;font-size:12px}'
    + '.gcm-tbl th{color:#64748b;font-weight:700}.gcm-tbl a{color:#1d4ed8}'
    + '.gcm-in{background:#fff;border:1px solid #d1d5db;border-radius:8px;color:#0f172a;padding:7px 9px;font:13px Inter,sans-serif}'
    + '.gcm-ok{color:#15803d}.gcm-no{color:#b91c1c}';"""
assert t.count(old) == 1, ('MAILWHITE anchor', t.count(old))
t = t.replace(old, new)
open(p, 'w', encoding='utf-8').write(t)
print('MAILWHITE: patched', p)
