#!/usr/bin/env python3
"""patch CUSTLINK (owner 11/20, desk: 🧾 Missing job data → "Customer linked" → Fix on J998, typed "mid south", saw nothing
in the dialog's list and the navy "📁 Projects" autocomplete popped over it).
 1. The dialog's search matched the typed text against one label (name or company) with a plain indexOf, so "mid south"
    never found "Mid-South Restoration Services, LLC" (the hyphen). It now searches every customer record (the CRM's list
    and window._graycoCustomers together) by name, company, contact, e-mail, phone and address: case and punctuation
    ignored, every typed word a partial match. The list is rebuilt (not <option hidden>), one match is picked for you,
    and a customer whose name matches the job's client is offered at the top (picked when it is the only one).
    Save links it (customerId; an empty client gets the customer's name) — the checklist item clears.
 2. The old SMART AUTOCOMPLETE dropdown never attaches to a box inside a dialog / picker ([role=dialog], [aria-modal],
    <dialog>, [data-gc-noac]); the Fix dialog is also marked data-gc-noac.
In-place, idempotent. Usage: python3 tools/patch_CUSTLINK.py [index.html]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(here), 'index.html')
src = open(P, encoding='utf-8').read()

def rep(o, n, tag):
    global src
    if n in src: return
    assert src.count(o) == 1, ('CUSTLINK anchor', tag, src.count(o))
    src = src.replace(o, n)

# 2. autocomplete: never inside a dialog / picker
rep('function noAc(inp){ try{ return !!(inp.closest&&inp.closest("[data-gc-noac]")); }catch(e){ return false; } }',
    'function noAc(inp){ try{ return !!(inp.closest&&inp.closest("[data-gc-noac],[role=\\"dialog\\"],[aria-modal=\\"true\\"],dialog")); }catch(e){ return false; } }   /* patch CUSTLINK: never in a dialog / picker */',
    'noAc')
rep("var ov = D.createElement('div'); ov.id = 'gc-df-fix'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gcnav-ignore', '1');",
    "var ov = D.createElement('div'); ov.id = 'gc-df-fix'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gcnav-ignore', '1'); ov.setAttribute('data-gc-noac', '1');   /* patch CUSTLINK */",
    'fix overlay')

# 1. the customer picker
rep("function customers(){ var l = arr(C().customers); if (!l.length) l = arr(W._graycoCustomers); return l.filter(function(c){ return c.id && !c.deleted && !c._deleted; }).sort(function(a, b){ return low(a.name || a.company) < low(b.name || b.company) ? -1 : 1; }); }",
    "function customers(){ var seen = {}, l = []; arr(C().customers).concat(arr(W._graycoCustomers)).forEach(function(c){ if (c && c.id && !c.deleted && !c._deleted && !seen[s(c.id)]) { seen[s(c.id)] = 1; l.push(c); } }); return l.sort(function(a, b){ return low(a.name || a.company) < low(b.name || b.company) ? -1 : 1; }); }   /* patch CUSTLINK: both lists */\n"
    "/* patch CUSTLINK: the Fix dialog's customer search — case, punctuation and LLC/Inc ignored, every typed word a partial match on any name / contact field */\n"
    "function cnorm(v){ return low(v).replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }\n"
    "function cbare(v){ return cnorm(v).replace(/\\b(llc|pllc|inc|incorporated|co|corp|corporation|company|ltd|the)\\b/g, ' ').replace(/\\s+/g, ' ').trim(); }\n"
    "function custHay(c){ var g = c.gcInfo && typeof c.gcInfo === 'object' ? c.gcInfo : {}, x = [c.name, c.company, c.contact, c.contactName, c.firstName, c.lastName, c.email, c.phone, c.address, c.city, g.name, g.contact];\n"
    "  arr(c.contacts).forEach(function(k){ if (k) x.push(k.name, k.email, k.phone); }); return cnorm(x.filter(function(v){ return typeof v === 'string' || typeof v === 'number'; }).join(' ')); }\n"
    "function custMatch(c, q){ var qq = cnorm(q); if (!qq) return true; var h = custHay(c); return qq.split(' ').every(function(w){ return h.indexOf(w) >= 0; }) || h.replace(/ /g, '').indexOf(qq.replace(/ /g, '')) >= 0; }\n"
    "function custLabel(c){ var n = s(c.name) || s(c.company), co = s(c.company), ct = s(c.contact || c.contactName); return n + (co && cnorm(co) !== cnorm(n) ? ' (' + co + ')' : '') + (ct && cnorm(ct) !== cnorm(n) ? ' · ' + ct : '') + (c.address ? ' — ' + s(c.address) : ''); }\n"
    "/* the job's client, matched to a customer: 2 = the same name (LLC etc. aside), 1 = the client is the start of the name (or the other way) */\n"
    "function custSuggest(p){ var cn = cbare(p.client || p.customer || p.clientName); if (cn.length < 3) return [];\n"
    "  var out = []; customers().forEach(function(c){ var r = 0; [c.name, c.company].forEach(function(n){ var b = cbare(n); if (!b) return; if (b === cn) r = 2; else if (r < 1 && cn.length >= 4 && ((b + ' ').indexOf(cn + ' ') === 0 || (cn + ' ').indexOf(b + ' ') === 0)) r = 1; }); if (r) out.push({ c: c, r: r }); });\n"
    "  out.sort(function(a, b){ return b.r - a.r; }); return out.slice(0, 3); }\n"
    "function custOptions(p, q, cur){ var sug = custSuggest(p), ids = {}, h = '<option value=\"\">— choose the customer —</option>', n = 0;\n"
    "  sug.forEach(function(x){ if (!custMatch(x.c, q)) return; ids[s(x.c.id)] = 1; n++; h += opt(x.c.id, cur, '★ ' + custLabel(x.c) + ' — the job’s client'); });\n"
    "  customers().forEach(function(c){ if (ids[s(c.id)] || !custMatch(c, q)) return; n++; h += opt(c.id, cur, custLabel(c)); });\n"
    "  return { html: h, n: n }; }\n"
    "function custPreset(p){ if (s(p.customerId)) return s(p.customerId); var sg = custSuggest(p); return sg.length && (sg.length === 1 || sg[0].r > sg[1].r) ? s(sg[0].c.id) : ''; }",
    'customers()')
rep("""    case 'customer': return '<input class="gc-df-in" data-cs="1" placeholder="Search customers…"><select class="gc-df-in" data-k="customerId" size="7"><option value="">— choose the customer —</option>' + customers().map(function(c){ return opt(c.id, p.customerId, (s(c.name) || s(c.company)) + (c.address ? ' — ' + s(c.address) : '')); }).join('') + '</select><div class="gc-df-note">Not on the list? Add them in Customers first.</div>';""",
    """    case 'customer': var co0 = custOptions(p, '', custPreset(p)); return '<input class="gc-df-in" data-cs="1" type="search" autocomplete="off" placeholder="Search customers…"><select class="gc-df-in" data-k="customerId" size="7">' + co0.html + '</select><div class="gc-df-note" data-cs-n="1">' + co0.n + ' customer' + (co0.n === 1 ? '' : 's') + '</div><div class="gc-df-note">Not on the list? Add them in Customers first.</div>';   /* patch CUSTLINK */""",
    'customer fix html')
rep("""  ov.addEventListener('input', function(e){ var t = e.target; if (t && t.getAttribute('data-cs')) { var q = low(t.value), sel = ov.querySelector('select[data-k="customerId"]'); [].forEach.call(sel.options, function(o, i){ if (i) o.hidden = !!q && low(o.textContent).indexOf(q) < 0; }); } });""",
    """  ov.addEventListener('input', function(e){ var t = e.target; if (t && t.getAttribute('data-cs')) { if (t.__q === t.value) return; t.__q = t.value; var sel = ov.querySelector('select[data-k="customerId"]'), nn = ov.querySelector('[data-cs-n]'), cur = sel.value, r = custOptions(p, t.value, cur);   /* patch CUSTLINK: the list rebuilt from every customer */
    sel.innerHTML = r.html; if (cur && sel.value !== cur) sel.value = ''; if (!sel.value && r.n === 1) sel.selectedIndex = 1;
    if (nn) nn.textContent = r.n ? r.n + ' customer' + (r.n === 1 ? '' : 's') + (s(t.value) ? ' match “' + s(t.value) + '”' : '') : 'No customer matches “' + s(t.value) + '”.'; } });""",
    'customer search')
rep("""          if (val === '') return;
          if (k === 'contract')""",
    """          if (val === '') return;
          if (k === 'customerId') { var cc = customers().filter(function(c){ return s(c.id) === val; })[0]; if (cc && !s(q.client)) q.client = s(cc.name) || s(cc.company); }   /* patch CUSTLINK */
          if (k === 'contract')""",
    'save customer')
open(P, 'w', encoding='utf-8').write(src); print('CUSTLINK applied')
