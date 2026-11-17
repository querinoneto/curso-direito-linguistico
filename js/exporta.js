// Exportação: PDF diagramado como livro (Paged.js) e Word editável (docx)
const Exporta = {};

// HTML de seção -> HTML para o PDF (notas viram rodapés flutuantes)
// (a numeração é feita aqui, porque o contador automático do Paged.js falha em livros longos)
let FN_N = 0;
function pdfBody(html) {
  const d = document.createElement('div'); d.innerHTML = html;
  d.querySelectorAll('mark.cm').forEach(m => m.replaceWith(...m.childNodes));
  d.querySelectorAll('.fn').forEach(f => {
    const n = ++FN_N;
    const sup = document.createElement('sup'); sup.className = 'fnref'; sup.textContent = n;
    const s = document.createElement('span'); s.className = 'footnote'; s.innerHTML = `<span class="fnnum">${n}.</span> ` + U.esc(f.dataset.note || '');
    f.replaceWith(sup, s);
  });
  return d.innerHTML;
}

Exporta.pdf = (M) => {
  const base = location.href.replace(/[^/]*$/, '');
  const font = (f, w, s) => `@font-face{font-family:Pagella;src:url(${base}fonts/${f}.otf);font-weight:${w};font-style:${s}}`;
  let toc = '', body = ''; FN_N = 0;
  M.parts.forEach(p => {
    toc += `<li class="tp"><a href="#${p.id}"><span>Parte ${p.num} — ${p.title}</span></a></li>`;
    body += `<section class="part" id="${p.id}"><div class="pnum">Parte ${p.num}</div><h1>${p.title}</h1></section>`;
    p.chapters.forEach(c => {
      toc += `<li class="tc"><a href="#${c.id}"><span>Capítulo ${c.num}. ${c.title}</span></a></li>`;
      body += `<section class="chapter"><div class="cnum">Capítulo ${c.num}</div><h2 id="${c.id}">${c.title}</h2>`;
      c.sections.forEach(s => {
        if (s.title) { toc += `<li class="ts"><a href="#${s.id}"><span>${s.num}. ${s.title}</span></a></li>`; body += `<h3 id="${s.id}">${s.num}. ${s.title}</h3>`; }
        body += pdfBody(s.html);
      });
      body += `</section>`;
    });
  });
  let refs = '';
  if (M.refs.doutrina.length || M.refs.jurisprudencia.length) {
    toc += `<li class="tp"><a href="#refs"><span>Referências</span></a></li>`;
    refs = `<section class="refs" id="refs"><h2 class="nocnt">Referências</h2>` +
      (M.refs.doutrina.length ? `<h3>Doutrina</h3>` + M.refs.doutrina.map(r => `<p>${r}</p>`).join('') : '') +
      (M.refs.jurisprudencia.length ? `<h3>Jurisprudência e documentos de órgãos internacionais</h3>` + M.refs.jurisprudencia.map(r => `<p>${r}</p>`).join('') : '') + `</section>`;
  }
  const m = M.meta;
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${m.title} — PDF</title>
<style>
${font('texgyrepagella-regular', 400, 'normal')}${font('texgyrepagella-italic', 400, 'italic')}${font('texgyrepagella-bold', 700, 'normal')}${font('texgyrepagella-bolditalic', 700, 'italic')}
@page{size:160mm 230mm;margin:20mm 17mm 22mm 21mm;
  @footnote{border-top:0.4pt solid #000;padding-top:1.5mm;margin-top:2mm}
  @bottom-center{content:counter(page);font-family:Pagella;font-size:9pt}
}
@page :left{margin-left:17mm;margin-right:21mm;@top-left{content:string(livro);font-family:Pagella;font-size:8.5pt;font-variant:small-caps;letter-spacing:.04em}}
@page :right{@top-right{content:string(cap);font-family:Pagella;font-size:8.5pt;font-style:italic}}
@page :blank{@top-left{content:none}@top-right{content:none}@bottom-center{content:none}}
@page front{@bottom-center{content:none}@top-left{content:none}@top-right{content:none}}
@page open{@top-left{content:none}@top-right{content:none}}
html{font-family:Pagella,"Palatino Linotype",serif;font-size:10.5pt;line-height:1.42;color:#000}
body{margin:0;hyphens:auto;-webkit-hyphens:auto}
.front{page:front;break-after:page;text-align:center}
.half{padding-top:55mm;font-size:16pt;font-variant:small-caps;letter-spacing:.05em}
.title{padding-top:28mm}.title .a{font-size:12pt;font-variant:small-caps;letter-spacing:.08em}.title h1{font-size:24pt;margin:30mm 0 6mm;font-weight:700}.title .v{font-size:12pt}.title .l{margin-top:70mm;font-size:11pt}
.cred{text-align:left;font-size:8.5pt;padding-top:140mm;line-height:1.5}
.toc{page:front;break-before:right;break-after:page}
.toc h2{font-size:15pt;text-align:center;margin:10mm 0 8mm;font-weight:700}
.toc ul{list-style:none;padding:0;margin:0;font-size:9.5pt}
.toc li{margin:1.2mm 0}.toc li.tp{margin-top:5mm;font-variant:small-caps;font-weight:700;letter-spacing:.04em}.toc li.tc{margin-top:2.5mm;font-weight:700}.toc li.ts{padding-left:6mm}
.toc a{color:#000;text-decoration:none;display:flex}
.toc a span{flex:1}
.toc a::after{content:target-counter(attr(href),page);padding-left:3mm}
.part{page:open;break-before:right;break-after:page;text-align:center;padding-top:60mm}
.pnum{font-variant:small-caps;letter-spacing:.1em;font-size:12pt}
.part h1{font-size:19pt;margin-top:8mm;font-weight:700;string-set:livro content(text)}
.chapter{break-before:right}
.cnum{padding-top:18mm;font-variant:small-caps;letter-spacing:.08em;font-size:11pt;text-align:center}
h2{font-size:16pt;text-align:center;margin:4mm 0 12mm;font-weight:700;string-set:cap content(text)}
h3{font-size:11.5pt;margin:7mm 0 3mm;font-weight:700;break-after:avoid;text-align:left;hyphens:none}
p{margin:0;text-indent:6mm;text-align:justify;orphans:2;widows:2}
h3+p,h2+p{text-indent:0}
blockquote{margin:3mm 0 3mm 12mm;font-size:9.5pt}blockquote p{text-indent:0}
figure.quadro{margin:5mm 0;font-size:8.5pt;break-inside:avoid}
figure.quadro figcaption{text-align:center;font-weight:700;margin-bottom:2mm}
figure.quadro table{width:100%;border-collapse:collapse}
figure.quadro th,figure.quadro td{padding:1mm 1.5mm;text-align:left;vertical-align:top;border-bottom:.3pt solid #000}
figure.quadro thead th{border-top:.8pt solid #000;border-bottom:.6pt solid #000}
figure.quadro tbody tr:last-child td{border-bottom:.8pt solid #000}
.footnote{float:footnote;display:block;font-size:8pt;line-height:1.3;text-align:justify;text-indent:0;margin:0;padding:0}
::footnote-call{content:none}
::footnote-marker{content:none}
sup.fnref{font-size:6.5pt;line-height:0;vertical-align:super}
.refs{break-before:right}

.refs h3{font-size:11pt;margin-top:6mm}
.refs p{text-indent:-6mm;padding-left:6mm;font-size:9.5pt;margin-bottom:1.6mm;text-align:left}
#bar{position:fixed;top:0;left:0;right:0;background:#2a2622;color:#fff;padding:10px;text-align:center;font:14px system-ui;z-index:9}
#bar button{font:inherit;padding:6px 14px;margin-left:10px;border-radius:6px;border:0;background:#7a2e1f;color:#fff;cursor:pointer}
@media print{#bar{display:none}}
@media screen{.pagedjs_pages{padding-top:50px}.pagedjs_page{background:#fff;margin:10px auto;box-shadow:0 1px 4px rgba(0,0,0,.3)}body{background:#ddd}}
</style>
<script>window.PagedConfig={auto:true,after:()=>{const b=document.getElementById('bar');b.innerHTML='Pronto: '+document.querySelectorAll('.pagedjs_page').length+' páginas. <button onclick="print()">Salvar como PDF</button> <small style="opacity:.75;margin-left:8px">Na janela de impressão, escolha “Salvar como PDF” e deixe as margens como “Nenhuma”.</small>';}};</script>
<script src="${base}lib/paged.polyfill.min.js"></script>
</head><body>
<div id="bar">Diagramando o livro… (pode levar alguns segundos)</div>
<section class="front half">${m.title}</section>
<section class="front title"><div class="a">${m.author}</div><h1>${m.title}</h1><div class="v">${m.subtitle || ''}</div><div class="l">${m.place}<br>${m.year}</div></section>
<section class="front cred">© ${m.year} ${m.author}<br>${m.edition || 'Versão de trabalho'} gerada em ${M.date}.<br>${M.scopeNote}<br>Revisão: ${M.stats}</section>
<nav class="toc"><h2>Sumário</h2><ul>${toc}</ul></nav>
${body}${refs}
</body></html>`;
  const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
  if (!w) U.toast('O navegador bloqueou a nova janela. Permita pop-ups para este site e tente de novo.', 5000);
};

// ---------------- Word ----------------
Exporta.docx = async (M) => {
  if (!window.docx) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'lib/docx.iife.js'; sc.onload = res; sc.onerror = () => rej(new Error('não foi possível carregar a biblioteca do Word')); document.head.appendChild(sc); });
  const X = window.docx;
  const FONT = 'Palatino Linotype';
  const footnotes = {}; let fnId = 0;
  const runs = (node, fmt = {}) => {
    const out = [];
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { if (n.nodeValue) out.push(new X.TextRun({ text: n.nodeValue.replace(/\s+/g, ' '), italics: !!fmt.i, bold: !!fmt.b, size: fmt.size, font: fmt.size ? FONT : undefined })); return; }
      if (n.nodeType !== 1) return;
      if (n.classList.contains('fn')) {
        fnId++; footnotes[fnId] = { children: [new X.Paragraph({ style: 'Nota', children: [new X.TextRun(n.dataset.note || '')] })] };
        out.push(new X.FootnoteReferenceRun(fnId)); return;
      }
      const f = { ...fmt }; if (n.tagName === 'I' || n.tagName === 'EM') f.i = !f.i; if (n.tagName === 'B' || n.tagName === 'STRONG') f.b = true;
      out.push(...runs(n, f));
    });
    return out;
  };
  const blocks = (html) => {
    const d = document.createElement('div'); d.innerHTML = html; const out = [];
    let first = true;
    d.childNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.tagName === 'P') { out.push(new X.Paragraph({ style: first ? 'CorpoPrimeiro' : 'Corpo', children: runs(n) })); first = false; }
      else if (n.tagName === 'BLOCKQUOTE') n.querySelectorAll('p').forEach(p => out.push(new X.Paragraph({ style: 'Citacao', children: runs(p) })));
      else if (n.tagName === 'FIGURE') {
        const cap = n.querySelector('figcaption'); if (cap) out.push(new X.Paragraph({ style: 'Legenda', children: runs(cap) }));
        const rows = [...n.querySelectorAll('tr')].map((tr, ri) => new X.TableRow({ tableHeader: ri === 0, children: [...tr.children].map(td => new X.TableCell({ children: [new X.Paragraph({ style: 'Tabela', children: runs(td, { b: ri === 0 }) })] })) }));
        const bd = { style: X.BorderStyle.SINGLE, size: 4, color: '000000' }, no = { style: X.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
        out.push(new X.Table({ rows, width: { size: 100, type: X.WidthType.PERCENTAGE }, borders: { top: bd, bottom: bd, insideHorizontal: bd, left: no, right: no, insideVertical: no } }));
        out.push(new X.Paragraph({ text: '' }));
      }
    });
    return out;
  };
  const m = M.meta, ch = [];
  const center = (text, opt = {}) => new X.Paragraph({ alignment: X.AlignmentType.CENTER, spacing: { before: opt.before || 0, after: opt.after || 0 }, pageBreakBefore: !!opt.pb, children: [new X.TextRun({ text, size: opt.size || 22, bold: !!opt.bold, smallCaps: !!opt.sc, font: FONT })] });
  ch.push(center(m.author, { before: 1200, size: 24, sc: true }), center(m.title, { before: 2400, size: 48, bold: true }), center(m.subtitle || '', { before: 240, size: 26 }), center(`${m.place}, ${m.year}`, { before: 3600, size: 22 }));
  ch.push(new X.Paragraph({ pageBreakBefore: true, spacing: { before: 6000 }, children: [new X.TextRun({ text: `© ${m.year} ${m.author}`, size: 17, font: FONT })] }),
    new X.Paragraph({ children: [new X.TextRun({ text: `${m.edition || 'Versão de trabalho'} gerada em ${M.date}. ${M.scopeNote}`, size: 17, font: FONT })] }),
    new X.Paragraph({ children: [new X.TextRun({ text: `Revisão: ${M.stats}`, size: 17, font: FONT })] }));
  ch.push(new X.Paragraph({ pageBreakBefore: true, alignment: X.AlignmentType.CENTER, spacing: { after: 300 }, children: [new X.TextRun({ text: 'Sumário', bold: true, size: 30, font: FONT })] }));
  ch.push(new X.TableOfContents('Sumário', { hyperlink: true, headingStyleRange: '1-3' }));
  M.parts.forEach(p => {
    ch.push(new X.Paragraph({ heading: X.HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { before: 3000 }, alignment: X.AlignmentType.CENTER, children: [new X.TextRun({ text: `Parte ${p.num}`, size: 26, smallCaps: true, font: FONT }), new X.TextRun({ text: p.titleText, break: 1, bold: true, size: 36, font: FONT })] }));
    p.chapters.forEach(c => {
      ch.push(new X.Paragraph({ heading: X.HeadingLevel.HEADING_2, pageBreakBefore: true, alignment: X.AlignmentType.CENTER, spacing: { before: 1200, after: 480 }, children: [new X.TextRun({ text: `Capítulo ${c.num}`, size: 22, smallCaps: true, font: FONT }), new X.TextRun({ text: c.titleText, break: 1, bold: true, size: 30, font: FONT })] }));
      c.sections.forEach(s => {
        if (s.title) { const h = document.createElement('div'); h.innerHTML = `${s.num}. ${s.title}`; ch.push(new X.Paragraph({ heading: X.HeadingLevel.HEADING_3, keepNext: true, spacing: { before: 360, after: 160 }, children: runs(h, { b: true, size: 23 }) })); }
        ch.push(...blocks(s.html));
      });
    });
  });
  if (M.refs.doutrina.length || M.refs.jurisprudencia.length) {
    ch.push(new X.Paragraph({ heading: X.HeadingLevel.HEADING_2, pageBreakBefore: true, text: 'Referências' }));
    const ref = (title, list) => { if (!list.length) return; ch.push(new X.Paragraph({ heading: X.HeadingLevel.HEADING_3, text: title })); list.forEach(r => { const d = document.createElement('div'); d.innerHTML = r; ch.push(new X.Paragraph({ style: 'Referencia', children: runs(d) })); }); };
    ref('Doutrina', M.refs.doutrina); ref('Jurisprudência e documentos de órgãos internacionais', M.refs.jurisprudencia);
  }
  const doc = new X.Document({
    creator: m.author, title: m.title, features: { updateFields: true },
    styles: {
      default: {
        document: { run: { font: FONT, size: 22 } },
        heading1: { run: { font: FONT, size: 36, bold: true, color: '000000' }, paragraph: { alignment: X.AlignmentType.CENTER, spacing: { after: 400 } } },
        heading2: { run: { font: FONT, size: 30, bold: true, color: '000000' }, paragraph: { alignment: X.AlignmentType.CENTER, spacing: { before: 1200, after: 480 } } },
        heading3: { run: { font: FONT, size: 23, bold: true, color: '000000' }, paragraph: { spacing: { before: 360, after: 160 }, keepNext: true } },
      },
      paragraphStyles: [
        { id: 'Corpo', name: 'Corpo do texto', basedOn: 'Normal', run: { font: FONT, size: 22 }, paragraph: { alignment: X.AlignmentType.JUSTIFIED, indent: { firstLine: 425 }, spacing: { line: 300, after: 0 } } },
        { id: 'CorpoPrimeiro', name: 'Corpo (primeiro parágrafo)', basedOn: 'Corpo', paragraph: { indent: { firstLine: 0 } } },
        { id: 'Citacao', name: 'Citação longa', basedOn: 'Normal', run: { font: FONT, size: 19 }, paragraph: { alignment: X.AlignmentType.JUSTIFIED, indent: { left: 1134 }, spacing: { before: 120, after: 120, line: 240 } } },
        { id: 'Legenda', name: 'Legenda de quadro', basedOn: 'Normal', run: { font: FONT, size: 18, bold: true }, paragraph: { alignment: X.AlignmentType.CENTER, spacing: { before: 200, after: 100 }, keepNext: true } },
        { id: 'Tabela', name: 'Texto de quadro', basedOn: 'Normal', run: { font: FONT, size: 17 }, paragraph: { spacing: { before: 40, after: 40 } } },
        { id: 'Nota', name: 'Texto de nota', basedOn: 'Normal', run: { font: FONT, size: 17 }, paragraph: { alignment: X.AlignmentType.JUSTIFIED, spacing: { after: 30 } } },
        { id: 'Referencia', name: 'Referência', basedOn: 'Normal', run: { font: FONT, size: 20 }, paragraph: { indent: { left: 425, hanging: 425 }, spacing: { after: 100 } } },
      ],
    },
    footnotes,
    sections: [{
      properties: { page: { size: { width: 9071, height: 13039 }, margin: { top: 1191, bottom: 1247, left: 1191, right: 964, gutter: 0 } } },
      footers: { default: new X.Footer({ children: [new X.Paragraph({ alignment: X.AlignmentType.CENTER, children: [new X.TextRun({ children: [X.PageNumber.CURRENT], size: 18, font: FONT })] })] }) },
      children: ch,
    }],
  });
  const blob = await X.Packer.toBlob(doc);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${m.title} - ${M.fileTag}.docx`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
