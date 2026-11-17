// Verificações automáticas: autores no corpo do texto, estilo, normas citadas
const Checks = {};

const STOP = new Set('aquela aquele aquilo assim através enquanto entretanto portanto contudo também porque quando quanto sobre entre contra desde durante mediante segundo conforme todavia somente apenas ainda sempre muito outros outras mesmo mesma própria próprio direito direitos língua línguas linguística linguístico linguísticos linguísticas estado estados brasil brasileiro brasileira norma normas jurídica jurídico jurídicas jurídicos constituição federal nacional internacional proteção falantes comunidade comunidades minorias minoritárias oficial oficiais público pública públicos públicas capítulo artigo dispositivo regime legislação princípio princípios garantia'.split(' '));

// Sobrenomes dos autores da lista de doutrina (ex.: "SKUTNABB-KANGAS" -> "Skutnabb-Kangas")
Checks.surnames = (D) => {
  const set = new Set();
  const cap = w => w.toLowerCase().replace(/(^|[\s\-’'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|Del|Van|Von|Y|E)\b/g, s => s.toLowerCase()).replace(/^Mcr/, 'McR');
  for (const r of D.refs.doutrina) {
    const t = U.plain(r.html);
    // todos os autores de uma entrada: "SOBRENOME, Nome; SOBRENOME2, Nome"
    t.split(/\.\s/)[0].split(';').forEach(a => {
      const s = a.split(',')[0].trim();
      if (/^[A-ZÀ-Ý][A-ZÀ-Ý'’\- ]+$/.test(s.replace(/^Mc/, 'MC')) && s.length > 2) set.add(cap(s));
    });
  }
  (D.ignoreNames || []).forEach(n => set.delete(n));
  return [...set].sort((a, b) => b.length - a.length);
};

// Ocorrências de nomes de autores fora das notas
Checks.authorsInBody = (html, names) => {
  if (!names.length) return [];
  const txt = U.plain(html);
  const re = new RegExp('(?<![\\p{L}])(' + names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}])', 'gu');
  const out = [];
  for (const m of txt.matchAll(re)) out.push({ type: 'autor', name: m[1], ctx: txt.slice(Math.max(0, m.index - 60), m.index + m[1].length + 60), term: m[1] });
  return out;
};

// Estilo: parágrafos telegráficos ou longos, frases longas, marcadores de lista, repetições próximas
Checks.style = (html) => {
  const out = [];
  const d = document.createElement('div'); d.innerHTML = html;
  d.querySelectorAll(':scope > p').forEach((p, i) => {
    const c = p.cloneNode(true); c.querySelectorAll('.fn').forEach(f => f.remove());
    const t = c.textContent.trim(); if (!t) return;
    const w = U.countWords(t);
    if (/^([-–•*·]|\d+[.)]\s|[a-z]\)\s)/.test(t)) out.push({ type: 'lista', msg: 'Parágrafo começa como item de lista', ctx: t.slice(0, 120), term: t.slice(0, 30) });
    else if (w < 30) out.push({ type: 'curto', msg: `Parágrafo curto (${w} palavras): pode soar como fichamento`, ctx: t.slice(0, 160), term: t.slice(0, 30) });
    if (w > 260) out.push({ type: 'longo', msg: `Parágrafo longo (${w} palavras): considere dividir`, ctx: t.slice(0, 160), term: t.slice(0, 30) });
    for (const s of t.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý“"])/)) {
      const sw = U.countWords(s);
      if (sw > 75) out.push({ type: 'frase', msg: `Frase longa (${sw} palavras)`, ctx: s.slice(0, 160) + '…', term: s.slice(0, 30) });
    }
    const toks = [...t.matchAll(/[\p{L}]+/gu)].map(m => m[0]);
    const pos = new Map(); const seen = new Set();
    toks.forEach((tk, k) => {
      const l = tk.toLowerCase();
      if (l.length < 7 || STOP.has(l) || seen.has(l)) return;
      const ps = (pos.get(l) || []).filter(x => k - x <= 40); ps.push(k); pos.set(l, ps);
      const close = ps.length >= 2 && ps[ps.length - 1] - ps[ps.length - 2] <= 8;
      if (ps.length >= 3 || close) {
        seen.add(l);
        out.push({ type: 'repeticao', msg: `Repetição próxima: “${l}”`, ctx: toks.slice(Math.max(0, ps[0] - 3), k + 4).join(' '), term: tk });
      }
    });
  });
  return out;
};

// Normas, decisões e casos citados
Checks.NORM_RES = [
  /\b(?:Lei Complementar|Lei|Decreto-Lei|Decreto Legislativo|Decreto|Medida Provisória|Emenda Constitucional|Resolução|Recomendação|Portaria|Instrução Normativa)(?: Conjunta)?(?: [A-Z][A-Za-z\/]{1,8})? nº [\d.]+(?:\/\d{2,4})?/g,
  /\b(?:Ação Direta de Inconstitucionalidade|ADI|ADPF|ADC|ADO|Arguição de Descumprimento de Preceito Fundamental) (?:nº )?[\d.]+/g,
  /\b(?:Recurso Extraordinário|Recurso Especial|RE|REsp|HC|Habeas Corpus|Mandado de Segurança|MS) (?:nº )?[\d.]{3,}/g,
  /\b(?:Comentário Geral|Observação Geral|Opinião Consultiva|Comunicação) nº [\d\/]+/g,
  /\bConvenção nº \d+ da (?:OIT|Organização Internacional do Trabalho)/g,
];
Checks.norms = (D, order) => {
  const idx = new Map();
  const add = (k, sec, ctx) => { if (!idx.has(k)) idx.set(k, { key: k, occ: [] }); idx.get(k).occ.push({ sec: sec.id, ctx }); };
  for (const sec of order) {
    const t = U.plain(sec.html, true);
    for (const re of Checks.NORM_RES) for (const m of t.matchAll(re)) add(m[0].replace(/\s+/g, ' '), sec, t.slice(Math.max(0, m.index - 70), m.index + m[0].length + 70));
    const d = document.createElement('div'); d.innerHTML = sec.html;
    d.querySelectorAll('i').forEach(i => { if (/ v\. /.test(i.textContent) || /^(caso|Caso)\b/.test(i.textContent)) add(i.textContent.trim(), sec, i.textContent); });
  }
  return [...idx.values()].sort((a, b) => a.key.localeCompare(b.key, 'pt'));
};
