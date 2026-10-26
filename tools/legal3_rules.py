# -*- coding: utf-8 -*-
"""LEGAL3: the giveaway Official Rules as plain text (one paragraph per section, tokens in [BRACKETS]) for giveaway.html and the CRM editor."""
import re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import legal3_docs as L3

def plain(t):
    t = t.replace('**', '')
    t = re.sub(r'\[\[(.*?)\]\]', r'[\1]', t)
    return t

def rules_text():
    paras, head, buf = [], '', []
    def flush():
        nonlocal head, buf
        if buf or head:
            paras.append(((head + ' ') if head else '') + ' '.join(buf))
        head, buf = '', []
    for b in L3.RULES_BLOCKS:
        k = b[0]
        if k == 'h':
            flush(); head = plain(b[1]).rstrip('.') + '.'
        elif k == 'p':
            buf.append(plain(b[1]))
        elif k == 'ul':
            letters = 'abcdefghij'
            buf.append(' '.join('(%s) %s' % (letters[i], plain(x)) for i, x in enumerate(b[1])))
    flush()
    return '\n\n'.join(paras)

if __name__ == '__main__':
    print(rules_text())
