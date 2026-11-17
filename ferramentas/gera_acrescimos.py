#!/usr/bin/env python3
"""Converte fontes/parte-NN.md e fontes/refs-novas.md em data/acrescimos.json.
Formato dos fontes: '# Parte', '## Capítulo', '### Seção', parágrafos separados por linha
em branco, *itálico*, ^[nota de rodapé]. Não toca em data/livro.json."""
import re, glob, json, html, sys, os, datetime
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROM = {'I':1,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,'X':10,'XI':11,'XII':12}
def inline(t):
    notas = []
    def guarda(m): notas.append(m.group(1).replace('*','').strip()); return '\x00%d\x00' % (len(notas)-1)
    t = re.sub(r'\^\[(.*?)\]', guarda, t, flags=re.S)
    t = html.escape(t, quote=False)
    t = re.sub(r'\*([^*\n]+)\*', r'<i>\1</i>', t)
    t = re.sub(r'\bCapítulo (\d{1,2})\b', lambda m: '<span class="xref" data-target="c%02d">Capítulo %s</span>' % (int(m.group(1)), m.group(1)) if 1 <= int(m.group(1)) <= 50 else m.group(0), t)
    t = re.sub(r'\bParte (XII|XI|IX|X|VIII|VII|VI|IV|V|III|II|I)\b(?! [a-zà-ú])', lambda m: '<span class="xref" data-target="p%d">Parte %s</span>' % (ROM[m.group(1)], m.group(1)), t)
    t = re.sub(r'\x00(\d+)\x00', lambda m: '<span class="fn" data-note="%s"></span>' % html.escape(notas[int(m.group(1))]), t)
    return t
def titulo(t):
    return re.sub(r'\*([^*]+)\*', r'<i>\1</i>', html.escape(t.strip(), quote=False))
parts = []; ncap = 10
for f in sorted(glob.glob(os.path.join(RAIZ, 'fontes', 'parte-*.md'))):
    np_ = int(re.search(r'parte-(\d+)', f).group(1))
    part = None; cap = None; sec = None
    for bloco in re.split(r'\n\s*\n', open(f, encoding='utf-8').read()):
        b = bloco.strip()
        if not b: continue
        if b.startswith('# '): part = {'id': 'p%d' % np_, 'title': titulo(b[2:]), 'chapters': []}; parts.append(part); continue
        if b.startswith('## '):
            ncap += 1; cap = {'id': 'c%02d' % ncap, 'title': titulo(b[3:]), 'sections': []}; part['chapters'].append(cap); sec = None; continue
        if b.startswith('### '):
            sec = {'id': 's%02d-%02d' % (ncap, len(cap['sections']) + 1), 'title': titulo(b[4:]), 'status': 'pendente', 'html': '', 'comments': []}; cap['sections'].append(sec); continue
        if b.startswith('#'): sys.exit('Título mal formado em %s: %s' % (f, b[:60]))
        if sec is None:
            sec = {'id': 's%02d-00' % ncap, 'title': None, 'intro': True, 'status': 'pendente', 'html': '', 'comments': []}; cap['sections'].append(sec)
        sec['html'] += '<p>%s</p>' % inline(b.replace('\n', ' '))
refs = {'doutrina': [], 'jurisprudencia': []}
rf = os.path.join(RAIZ, 'fontes', 'refs-novas.md')
if os.path.exists(rf):
    for i, l in enumerate(open(rf, encoding='utf-8').read().split('\n')):
        l = l.strip()
        if l.startswith('D: '): refs['doutrina'].append({'id': 'rn-d%03d' % i, 'html': titulo(l[3:])})
        elif l.startswith('J: '): refs['jurisprudencia'].append({'id': 'rn-j%03d' % i, 'html': titulo(l[3:])})
out = {'seedVersion': 2, 'generated': datetime.datetime.now().isoformat(timespec='seconds'), 'parts': parts, 'refs': refs}
json.dump(out, open(os.path.join(RAIZ, 'data', 'acrescimos.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
tot = 0
for p in parts:
    for c in p['chapters']:
        w = sum(len(re.findall(r'\w+', re.sub('<[^>]+>', ' ', s['html']))) for s in c['sections']); tot += w
        print(c['id'], len(c['sections']), 'seções', w, 'palavras', '|', re.sub('<[^>]+>', '', c['title'])[:50])
print('TOTAL', tot, 'palavras;', sum(len(p['chapters']) for p in parts), 'capítulos;', len(refs['doutrina']), '+', len(refs['jurisprudencia']), 'referências novas')
