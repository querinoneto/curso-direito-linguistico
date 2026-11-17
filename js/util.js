// Funções auxiliares
const U = {};

U.esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
U.uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
U.roman = n => { const m = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let r = ''; for (const [v, s] of m) while (n >= v) { r += s; n -= v; } return r; };
U.debounce = (fn, ms) => { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.flush = (...a) => { clearTimeout(t); fn(...a); }; return f; };
U.norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
U.fmtDate = d => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
U.toast = (msg, ms = 2600) => {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
};

// Texto puro de um HTML de seção. withNotes: inclui o texto das notas entre ⁽ ⁾
U.plain = (html, withNotes = false) => {
  const d = document.createElement('div'); d.innerHTML = html;
  d.querySelectorAll('.fn').forEach(f => f.replaceWith(withNotes ? ' ⁽' + (f.dataset.note || '') + '⁾' : ''));
  d.querySelectorAll('p,figcaption,tr,blockquote').forEach(p => p.append('\n'));
  d.querySelectorAll('td,th').forEach(p => p.append(' | '));
  return d.textContent.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
};
U.countWords = text => (text.match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu) || []).length;

// Limpa o HTML produzido pelo editor, mantendo só a marcação permitida.
U.cleanHTML = root => {
  const BLOCK = new Set(['P', 'BLOCKQUOTE', 'FIGURE', 'FIGCAPTION', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
  function inner(node) {
    let out = '';
    node.childNodes.forEach(n => { out += conv(n); });
    return out;
  }
  function conv(n) {
    if (n.nodeType === 3) return U.esc(n.nodeValue).replace(/&quot;/g, '"');
    if (n.nodeType !== 1) return '';
    const tag = n.tagName;
    if (tag === 'SPAN' && n.classList.contains('fn')) return `<span class="fn" data-note="${U.esc(n.dataset.note || '')}"></span>`;
    if (tag === 'SPAN' && n.classList.contains('xref')) return `<span class="xref" data-target="${U.esc(n.dataset.target)}">${U.esc(n.textContent)}</span>`;
    if (tag === 'MARK' && n.classList.contains('cm')) { const c = inner(n); return c ? `<mark class="cm" data-id="${U.esc(n.dataset.id)}">${c}</mark>` : ''; }
    if (tag === 'I' || tag === 'EM') { const c = inner(n); return c ? `<i>${c}</i>` : ''; }
    if (tag === 'B' || tag === 'STRONG') { const c = inner(n); return c ? `<b>${c}</b>` : ''; }
    if (tag === 'BR') return ' ';
    if (tag === 'DIV' || tag === 'P' || tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'LI') {
      // blocos dentro de blocos (ex.: <div> criado pelo navegador) viram parágrafos próprios
      const hasBlock = [...n.children].some(c => ['DIV', 'P', 'BLOCKQUOTE', 'FIGURE', 'TABLE', 'UL', 'OL'].includes(c.tagName));
      if (hasBlock) return inner(n);
      const c = inner(n).trim();
      return c ? `<p>${c}</p>` : '';
    }
    if (tag === 'UL' || tag === 'OL') return inner(n);
    if (tag === 'BLOCKQUOTE') {
      let c = inner(n).trim();
      if (!c) return '';
      if (!/^<p>/.test(c)) c = `<p>${c}</p>`;
      return `<blockquote>${c}</blockquote>`;
    }
    if (tag === 'FIGURE') return `<figure class="quadro">${inner(n)}</figure>`;
    if (BLOCK.has(tag)) return `<${tag.toLowerCase()}>${inner(n)}</${tag.toLowerCase()}>`;
    // span de estilo, font, a etc.: desembrulha (preservando itálico/negrito inline do estilo)
    let c = inner(n);
    const st = n.getAttribute && (n.getAttribute('style') || '');
    if (/font-style:\s*italic/.test(st)) c = `<i>${c}</i>`;
    if (/font-weight:\s*(bold|[6-9]00)/.test(st)) c = `<b>${c}</b>`;
    return c;
  }
  let html = inner(root);
  // texto solto fora de parágrafo
  const tmp = document.createElement('div'); tmp.innerHTML = html;
  let out = '', loose = '';
  tmp.childNodes.forEach(n => {
    const isBlock = n.nodeType === 1 && ['P', 'BLOCKQUOTE', 'FIGURE'].includes(n.tagName);
    if (isBlock) { if (loose.trim()) out += `<p>${loose.trim()}</p>`; loose = ''; out += n.outerHTML; }
    else loose += n.nodeType === 3 ? U.esc(n.nodeValue) : n.outerHTML;
  });
  if (loose.trim()) out += `<p>${loose.trim()}</p>`;
  return out.replace(/<i><\/i>|<b><\/b>/g, '').replace(/<\/i><i>/g, '').replace(/<\/b><b>/g, '');
};

// Diferença palavra a palavra (LCS), devolve HTML com <ins>/<del>
U.diffHTML = (a, b) => {
  const tok = s => s.match(/\s+|[^\s]+/g) || [];
  let A = tok(a), B = tok(b);
  // corta prefixo e sufixo comuns
  let pre = 0; while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0; while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const head = A.slice(0, pre).join(''), tail = suf ? A.slice(A.length - suf).join('') : '';
  A = A.slice(pre, A.length - suf); B = B.slice(pre, B.length - suf);
  const n = A.length, m = B.length;
  let mid = '';
  if (n * m > 25e6) {
    mid = `<del>${U.esc(A.join(''))}</del><ins>${U.esc(B.join(''))}</ins>`;
  } else {
    const L = new Array(n + 1);
    for (let i = 0; i <= n; i++) L[i] = new Uint16Array(m + 1);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0, d = '', s = '';
    const flush = () => { if (d) mid += `<del>${U.esc(d)}</del>`; if (s) mid += `<ins>${U.esc(s)}</ins>`; d = s = ''; };
    while (i < n && j < m) {
      if (A[i] === B[j]) { flush(); mid += U.esc(A[i]); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { d += A[i++]; }
      else { s += B[j++]; }
    }
    while (i < n) d += A[i++]; while (j < m) s += B[j++]; flush();
  }
  return U.esc(head) + mid + U.esc(tail);
};

// ---------- Citações e referências ----------
// Chave de uma referência: primeiro autor (antes do primeiro ponto, vírgula ou parêntese) + ano
U.refKey = refHTML => {
  const t = U.plain(refHTML);
  const autor = t.split(/[.,(]/)[0];
  let ano = (t.match(/(\d{4}[a-z])\.?\s*$/) || [])[1];
  if (!ano) {
    let ys = [...t.matchAll(/(?<=(?:\bde|\bem|,|\.|:)\s)(1[0-9]\d\d|20\d\d)(?![\d\/])/g)];
    if (!ys.length) ys = [...t.matchAll(/(?<!\d)(1[0-9]\d\d|20\d\d)(?!\d)/g)];
    ano = ys.length ? ys[ys.length - 1][1] : '?';
  }
  return U.norm(autor) + '|' + ano;
};
// Citações autor-data dentro do texto de uma nota
U.CIT = /((?:Mc)?[A-ZÀ-Ý][A-Za-zÀ-ÿ'’\-]*(?:\s+(?:DE|DA|DO|DOS|DAS|DEL|VAN|VON|Y|E)?\s*(?:Mc)?[A-ZÀ-Ý][A-ZÀ-Ý'’\-]*)*(?:\s+et al\.)?(?:;\s*(?:Mc)?[A-ZÀ-Ý][A-Za-zÀ-ÿ'’\-]*(?:\s+(?:Mc)?[A-ZÀ-Ý][A-ZÀ-Ý'’\-]*)*)*),\s*(\d{4}[a-z]?)/g;
U.citations = note => {
  const out = [];
  for (const m of String(note).matchAll(U.CIT)) {
    const autor = m[1].split(';')[0].replace(/\s+et al\./, '').trim();
    if (!/^(?:Mc)?[A-ZÀ-Ý]{2,}/.test(autor.replace(/^Mc/, 'MC'))) continue;
    out.push({ key: U.norm(autor) + '|' + m[2], label: `${autor}, ${m[2]}`, raw: m[0] });
  }
  return out;
};
