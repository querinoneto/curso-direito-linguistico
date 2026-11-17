#!/usr/bin/env python3
"""Insere as Partes III a XII e os Apêndices (fontes/*.md) em data/livro.json e data/original.json.

Formato dos fontes: '# Parte', '## Capítulo', '### Seção', parágrafos separados por linha em
branco, *itálico*, **negrito**, ^[nota de rodapé], citação em bloco com '> ' e quadros com uma
linha 'Quadro: legenda' seguida de linhas '| a | b |' (a primeira é o cabeçalho).
As Partes I e II (p1 e p2) nunca são alteradas. Rodar de novo substitui apenas o que veio dos fontes.
"""
import re, glob, json, html, sys, os, datetime, unicodedata
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROM = {'I':1,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,'X':10,'XI':11,'XII':12}

def marcas(t):
    t = re.sub(r'\*\*([^*\n]+)\*\*', r'<b>\1</b>', t)
    return re.sub(r'\*([^*\n]+)\*', r'<i>\1</i>', t)

def inline(t, xref=True):
    notas = []
    def guarda(m): notas.append(m.group(1).replace('*', '').strip()); return '\x00%d\x00' % (len(notas) - 1)
    t = re.sub(r'\^\[(.*?)\]', guarda, t, flags=re.S)
    t = marcas(html.escape(t, quote=False))
    if xref:
        t = re.sub(r'\bCapítulo (\d{1,2})\b', lambda m: '<span class="xref" data-target="c%02d">Capítulo %s</span>' % (int(m.group(1)), m.group(1)) if 1 <= int(m.group(1)) <= 50 else m.group(0), t)
        t = re.sub(r'\bParte (XII|XI|IX|X|VIII|VII|VI|IV|V|III|II|I)\b(?! [a-zà-ú])', lambda m: '<span class="xref" data-target="p%d">Parte %s</span>' % (ROM[m.group(1)], m.group(1)), t)
    t = re.sub(r'\x00(\d+)\x00', lambda m: '<span class="fn" data-note="%s"></span>' % html.escape(notas[int(m.group(1))]), t)
    return t

def titulo(t): return marcas(html.escape(t.strip(), quote=False))

def quadro(b):
    linhas = b.split('\n'); cap = ''
    if linhas[0].startswith('Quadro:'): cap = linhas.pop(0)[7:].strip()
    rows = [[c.strip() for c in l.strip().strip('|').split('|')] for l in linhas if l.strip().startswith('|')]
    h = '<figure class="quadro">' + ('<figcaption>%s</figcaption>' % titulo(cap) if cap else '') + '<table><thead><tr>'
    h += ''.join('<th>%s</th>' % inline(c, False) for c in rows[0]) + '</tr></thead><tbody>'
    h += ''.join('<tr>' + ''.join('<td>%s</td>' % inline(c, False) for c in r) + '</tr>' for r in rows[1:])
    return h + '</tbody></table></figure>'

def bloco(b):
    if b.startswith('Quadro:') or b.startswith('|'): return quadro(b)
    if b.startswith('>'):
        ls = [re.sub(r'^>\s?', '', l).strip() for l in b.split('\n')]
        return '<blockquote>' + ''.join('<p>%s</p>' % inline(l, False) for l in ls if l) + '</blockquote>'
    return '<p>%s</p>' % inline(b.replace('\n', ' '))

def le(f, pid, cprefix, ncap, apend=False):
    part = None; cap = None; sec = None; caps = []
    for b in re.split(r'\n\s*\n', open(f, encoding='utf-8').read()):
        b = b.strip()
        if not b: continue
        if b.startswith('# '):
            part = {'id': pid, 'title': titulo(b[2:]), 'chapters': caps}
            if apend: part['kind'] = 'apendices'
            continue
        if b.startswith('## '):
            ncap += 1; cap = {'id': '%s%02d' % (cprefix, ncap), 'title': titulo(b[3:]), 'sections': []}; caps.append(cap); sec = None; continue
        if b.startswith('### '):
            sec = {'id': 's%s%02d-%02d' % (cprefix if apend else '', ncap, len(cap['sections']) + 1), 'title': titulo(b[4:]), 'status': 'pendente', 'html': '', 'comments': []}
            cap['sections'].append(sec); continue
        if b.startswith('#'): sys.exit('Título mal formado em %s: %s' % (f, b[:60]))
        if sec is None:
            sec = {'id': 's%s%02d-00' % (cprefix if apend else '', ncap), 'title': None, 'intro': True, 'status': 'pendente', 'html': '', 'comments': []}
            cap['sections'].append(sec)
        sec['html'] += bloco(b)
    return part, ncap

def U(s): return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().upper().strip()
def plain(h): return re.sub('<[^>]+>', '', h)
def rkey(h):
    t = plain(h); a = re.split(r'[.,(]', t, maxsplit=1)[0]
    m = re.search(r'(\d{4}[a-z])\.?\s*$', t)
    if m: return U(a) + '|' + m.group(1)
    ys = re.findall(r'(?:(?<=de )|(?<=em )|(?<=, )|(?<=\. )|(?<=: ))(1[0-9]\d\d|20\d\d)(?![\d/])', t) or re.findall(r'(?<!\d)(1[0-9]\d\d|20\d\d)(?!\d)', t)
    return U(a) + '|' + (ys[-1] if ys else '?')

novas = []; ncap = 10
for f in sorted(glob.glob(os.path.join(RAIZ, 'fontes', 'parte-*.md'))):
    np_ = int(re.search(r'parte-(\d+)', f).group(1))
    p, ncap = le(f, 'p%d' % np_, 'c', ncap); novas.append(p)
ap = os.path.join(RAIZ, 'fontes', 'apendices.md')
if os.path.exists(ap): p, _ = le(ap, 'pap', 'a', 0, apend=True); novas.append(p)

refs = {'doutrina': [], 'jurisprudencia': []}
for i, l in enumerate(open(os.path.join(RAIZ, 'fontes', 'refs-novas.md'), encoding='utf-8').read().split('\n')):
    l = l.strip()
    if l.startswith('D: '): refs['doutrina'].append({'id': 'rn-d%03d' % i, 'html': titulo(l[3:])})
    elif l.startswith('J: '): refs['jurisprudencia'].append({'id': 'rn-j%03d' % i, 'html': titulo(l[3:])})

import hashlib
for p in novas: p['rev'] = hashlib.sha1(json.dumps(p['chapters'], ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:10]
ids = {p['id'] for p in novas}
for nome in ('livro.json', 'original.json'):
    path = os.path.join(RAIZ, 'data', nome)
    D = json.load(open(path, encoding='utf-8'))
    antigas = {p['id']: p for p in D['parts'] if p['id'] in ids}
    base = [p for p in D['parts'] if p['id'] not in ids]
    assert [p['id'] for p in base[:2]] == ['p1', 'p2'], 'Partes I e II não encontradas'
    for p in novas:
        q = json.loads(json.dumps(p))
        if nome == 'livro.json' and p['id'] in antigas:  # preserva estados e comentários já feitos
            old = {s['id']: s for c in antigas[p['id']]['chapters'] for s in c['sections']}
            for c in q['chapters']:
                for s in c['sections']:
                    if s['id'] in old and old[s['id']]['status'] != 'pendente':
                        s.update({k: old[s['id']][k] for k in ('html', 'title', 'status', 'comments') if k in old[s['id']]})
        base.append(q)
    D['parts'] = base
    for g in ('doutrina', 'jurisprudencia'):
        have = {rkey(r['html']) for r in D['refs'][g]}
        for r in refs[g]:
            if rkey(r['html']) not in have: D['refs'][g].append(r); have.add(rkey(r['html']))
    if nome == 'livro.json':
        D['seedParts'] = [p['id'] for p in D['parts']]
        D['updated'] = datetime.datetime.now().isoformat(timespec='seconds')
    json.dump(D, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

tot = 0
for p in novas:
    for c in p['chapters']:
        w = sum(len(re.findall(r'\w+', plain(s['html']))) for s in c['sections']); tot += w
        print(c['id'], len(c['sections']), 'seções', w, 'palavras |', plain(c['title'])[:50])
print('TOTAL', tot, 'palavras;', sum(len(p['chapters']) for p in novas), 'capítulos;', len(refs['doutrina']), '+', len(refs['jurisprudencia']), 'referências novas')
