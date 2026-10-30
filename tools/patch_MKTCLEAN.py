#!/usr/bin/env python3
"""Idempotent patch MKTCLEAN (owner 10/29: "I don't want this here — testimonials"): the 💬 Testimonials bar is no
longer put on top of 📣 Marketing. The list still opens with _gcOpenTestimonials() (Admin / Marketing tools)."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch MKTCLEAN'
if MARK in t: print('MKTCLEAN: already patched'); sys.exit(0)
old = """function mktCard(){
  var g = D.querySelector('.gmt-card'); var root = g && g.parentNode; var have = D.getElementById('gc-x10-mkt');"""
new = """function mktCard(){
  """ + MARK + """: no Testimonials bar on Marketing */ var _h = D.getElementById('gc-x10-mkt'); if (_h) _h.remove(); W._gcOpenTestimonials = openTestis; return;
  var g = D.querySelector('.gmt-card'); var root = g && g.parentNode; var have = D.getElementById('gc-x10-mkt');"""
assert t.count(old) == 1, t.count(old)
t = t.replace(old, new); open(p, 'w', encoding='utf-8').write(t); print('MKTCLEAN: patched')
