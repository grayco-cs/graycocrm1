#!/usr/bin/env python3
"""Idempotent patch COMPANYDOCS: 📁 Company documents becomes the one company library, in folders, for every staff member.

    python3 tools/patch_COMPANYDOCS.py [index.html]        (default: ./index.html)

What it changes in index.html (the server — netlify/functions/_lib/gcp.js, gc-portal.js — and portal.html are edited directly):
  1. Adds the library (tools/companydocs.js) after the LEGAL3 drafts: folders Insurance · Tax · Licenses · Safety · HR · Legal & contracts
     · Marketing · Company info; generated papers render from the CRM's own generators; uploads go through the CRM file storage and the
     gc-portal docs-* actions; "Missing" / expiry badges; who-sees-what; "Share with GCs"; the GC-portal hook _gcCompanyDocsForGC().
  2. Embeds the DRAFT Construction Safety Program and the 12 toolbox talks from tools/companydocs_safety.py.
  3. ⚙ Admin → 📄 Company documents renders the library (was: the GC-only upload table).
  4. Docs → "📁 Company documents" opens the library for everyone; the old button stays as "📚 Document templates".
Every find-string must occur the stated number of times (once unless noted). Re-running changes nothing.
"""
import sys, os, re, json, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import companydocs_safety as S

ipath = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(ipath, encoding='utf-8').read()
MARK = '<!-- COMPANYDOCS-patch -->'
if MARK in src:
    print('already patched'); sys.exit(0)


def once(old, new, label, n=1):
    global src
    c = src.count(old)
    assert c == n, ('anchor count != %d' % n, label, c)
    src = src.replace(old, new)


def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'\[(OWNER TO (?:FILL|CONFIRM)[^\]]*)\]', r'<span class="gc-fill" style="background:#fff3bf;border-radius:2px;padding:0 2px">[\1]</span>', t)
    return t.replace('\n', '<br>')


def line(label):
    return '<td style="padding:22px 8px 4px;vertical-align:bottom;width:50%"><div style="border-top:1px solid #333;padding-top:3px;font-size:9pt;color:#444">' + label + '</div></td>'


def render(blocks, rev):
    out = []
    for b in blocks:
        k = b[0]
        if k == 'draft':
            out.append('<div data-gc-draft="1" style="border:2px solid #b91c1c;background:#fef2f2;color:#7f1d1d;border-radius:6px;padding:8px 10px;margin:4px 0 12px;font-size:9.5pt;line-height:1.45">' + inline(b[1]) + '</div><!--/draft-->')
        elif k == 'h':
            out.append('<h3 style="font-size:12.5pt;margin:16px 0 6px;color:#0f2440;border-bottom:1px solid #e2e8f0;padding-bottom:2px">' + inline(b[1]) + '</h3>')
        elif k == 'h4':
            out.append('<h4 style="font-size:10.5pt;margin:10px 0 4px;color:#1e3a5f">' + inline(b[1]) + '</h4>')
        elif k == 'p':
            out.append('<p style="margin:0 0 9px;line-height:1.5">' + inline(b[1]) + '</p>')
        elif k == 'note':
            out.append('<p style="margin:6px 0 10px;font-size:9.5pt;color:#555;font-style:italic">' + inline(b[1]) + '</p>')
        elif k == 'ul':
            out.append('<ul style="margin:0 0 9px 20px;padding:0;line-height:1.45">' + ''.join('<li style="margin:0 0 4px">' + inline(x) + '</li>' for x in b[1]) + '</ul>')
        elif k == 'info':
            out.append('<table style="width:100%;border-collapse:collapse;font-size:10pt;margin:6px 0 12px">' + ''.join(
                '<tr><td style="padding:6px;width:38%;color:#555;border:1px solid #e5e7eb;vertical-align:top">' + inline(r[0]) + '</td><td style="padding:6px;border:1px solid #e5e7eb;vertical-align:top"><b>' + (inline(r[1]) if r[1] else '&nbsp;') + '</b></td></tr>' for r in b[1]) + '</table>')
        elif k == 'lines':
            out.append(''.join(('<div style="font-size:10pt;font-weight:700;margin:10px 0 0">' + inline(x) + '</div>') if x else '<div style="border-bottom:1px solid #999;height:22px"></div>' for x in b[1]))
        elif k == 'sigs':
            out.append('<table style="width:100%;border-collapse:collapse;margin-top:14px"><tr>' + line(html.escape(b[1]) + ' — signature') + line(html.escape(b[2]) + ' — signature') + '</tr><tr>' + line('Printed name / title') + line('Printed name / title') + '</tr><tr>' + line('Date') + line('Date') + '</tr></table>')
        elif k == 'pb':
            out.append('<div class="gc-pb"></div>')
        else:
            raise ValueError(k)
    out.append('<p style="margin:18px 0 0;font-size:8.5pt;color:#777;text-align:right" data-gc-formrev="1">' + html.escape(rev) + '</p>')
    return ''.join(out)


def esc_js(v):
    return json.dumps(v, ensure_ascii=False).replace('</', '<\\/').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')


safety_html = render(S.SAFETY, S.REV)
talks = [{'id': t[0], 'title': t[1], 'why': inline(t[2]), 'points': [inline(x) for x in t[3]], 'ask': [inline(x) for x in t[4]]} for t in S.TALKS]
assert len(talks) == 12
js = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'companydocs.js'), encoding='utf-8').read()
for k, v in [('__SAFETY_HTML__', esc_js(safety_html)), ('__TALKS__', '(function(){ var t = ' + esc_js(talks) + '; t.rev = ' + esc_js(S.TALK_REV) + '; return t; })()'),
             ('__FIELDS__', esc_js([list(x) for x in S.FIELDS])), ('__SAFETY_REV__', esc_js(S.REV)), ('__DRAFT_TXT__', esc_js(S.DRAFT))]:
    assert js.count(k) == 1, k
    js = js.replace(k, v)
assert '</script' not in js.lower()

# 1 + 2. the library, after the LEGAL3 drafts (it reads _gcDocLib / _gcLegal3 when it draws)
once('<!-- LEGAL3-patch -->', '<!-- LEGAL3-patch -->\n<script id="gc-patch-companydocs">\n' + js + '</script>\n' + MARK, 'after-legal3')

# 3. ⚙ Admin → 📄 Company documents draws the library
once("W._gcAdmAddSection({ id: 'compdocs', after: 'security', ic: '📄', t: 'Company documents', d: 'COI, W-9, licenses and safety papers every GC can download', render: renderDocs,\n"
     "    count: function(){ var n = arr(CD.list).filter(function(d){ return d.current && !d.removed; }).length; return CD.list ? (n ? n + ' current' : 'none yet') : 'COI · W-9 · licenses'; } });",
     "W._gcAdmAddSection({ id: 'compdocs', after: 'security', ic: '📄', t: 'Company documents', d: 'The company library: insurance, tax, licenses, safety, HR, legal, marketing — what staff and GCs can see', render: function(box){ return W._gcCompanyLib ? W._gcCompanyLib.renderAdmin(box) : renderDocs(box); },   /* patch COMPANYDOCS */\n"
     "    count: function(){ try { if (W._gcCompanyLib) { var st = W._gcCompanyLib.state(); if (st.docs) return st.missing.length ? st.missing.length + ' missing' : 'all on file'; return '8 folders'; } } catch (e) {} var n = arr(CD.list).filter(function(d){ return d.current && !d.removed; }).length; return CD.list ? (n ? n + ' current' : 'none yet') : 'COI · W-9 · licenses'; } });",
     'admin-section')

# 4. Docs tab: the library for everyone; the template library keeps its own button
once('e.jsx("button",{onClick:()=>window._docLibrary&&window._docLibrary(),style:{padding:"8px 14px",background:"#0f1d2f",color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer"},children:"📚 Company Documents"})',
     'e.jsx("button",{onClick:()=>window._gcCompanyLib?window._gcCompanyLib.open():(window._docLibrary&&window._docLibrary()),"data-gc-companydocs":"1",style:{padding:"8px 14px",background:"#d4a017",color:"#14202e",border:"none",borderRadius:7,fontSize:12,fontWeight:800,cursor:"pointer"},children:"📁 Company documents"}),'
     'e.jsx("button",{onClick:()=>window._docLibrary&&window._docLibrary(),style:{padding:"8px 14px",background:"#0f1d2f",color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer"},children:"📚 Document templates"})',
     'docs-tab-button')

open(ipath, 'w', encoding='utf-8').write(src)
print('patched COMPANYDOCS: library %d chars, safety program %d chars, %d talks' % (len(js), len(safety_html), len(talks)))
