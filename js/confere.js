// Conferência de fontes: liga cada citação das notas à afirmação do texto e à referência,
// oferece links para abrir/buscar a fonte e registra se a fonte confere.
// Os registros ficam em D.verif (fora do HTML, para não alterar o texto nem o status das seções).
// Chave = seção + citação + impressão digital da afirmação: se a afirmação for reescrita, volta a "pendente".
const CK = {
  ok: { ic: '✓', label: 'Confere', cls: 'ok' },
  part: { ic: '≈', label: 'Confere em parte', cls: 'part' },
  no: { ic: '✗', label: 'Não confere', cls: 'no' },
  pend: { ic: '·', label: 'A conferir', cls: 'pend' },
};

const CF = {};
CF.hash = s => { let h = 5381; const t = U.norm(s).replace(/[^A-Z0-9]+/g, ''); for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0; return h.toString(36); };

// Afirmação sustentada pela nota: o trecho do mesmo parágrafo entre a nota anterior (ou o início) e esta nota,
// limitado às duas últimas frases.
CF.claim = f => {
  const blk = f.closest('p,blockquote,td,th,figcaption,li') || f.parentElement;
  const r = document.createRange(); r.setStart(blk, 0); r.setEndBefore(f);
  const frag = r.cloneContents(); const tmp = document.createElement('div'); tmp.append(frag);
  const prev = [...tmp.querySelectorAll('.fn')].pop();
  let t;
  if (prev) { const r2 = document.createRange(); r2.setStartAfter(prev); r2.setEnd(tmp, tmp.childNodes.length); t = r2.toString(); } else t = tmp.textContent;
  t = t.replace(/\s+/g, ' ').trim();
  const ss = t.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý“"(])/);
  let out = ss.pop() || '';
  if (out.length < 140 && ss.length) out = ss.pop() + ' ' + out;
  return out.trim();
};

CF.refIndex = () => { const m = new Map(); ['doutrina', 'jurisprudencia'].forEach(g => D.refs[g].forEach(r => m.set(U.refKey(r.html), { r, g }))); return m; };
CF.key = (sid, c, claim) => `${sid}|${c.key}|${CF.hash(claim)}`;
CF.get = k => (D.verif || {})[k] || null;
CF.set = (k, st, obs) => {
  D.verif = D.verif || {};
  if (st === 'pend' && !obs) delete D.verif[k];
  else D.verif[k] = { st, obs: obs || '', t: new Date().toISOString() };
  touch();
};

// Itens de conferência de uma seção (a partir do HTML salvo ou do editor aberto)
CF.items = (s, root) => {
  const d = root || (() => { const x = document.createElement('div'); x.innerHTML = s.html; return x; })();
  const out = [];
  [...d.querySelectorAll('.fn')].forEach((f, ni) => {
    const note = f.dataset.note || ''; const cits = U.citations(note); if (!cits.length) return;
    const claim = CF.claim(f);
    cits.forEach(c => out.push({ s, ni, f, note, c, claim, k: CF.key(s.id, c, claim) }));
  });
  return out;
};
CF.status = it => { const v = CF.get(it.k); return v ? v.st : 'pend'; };
CF.noteStatus = (s, f, root) => { // pior status entre as citações da nota, para colorir o número no texto
  const cits = U.citations(f.dataset.note || ''); if (!cits.length) return '';
  const claim = CF.claim(f); const st = cits.map(c => { const v = CF.get(CF.key(s.id, c, claim)); return v ? v.st : 'pend'; });
  return st.includes('no') ? 'no' : st.includes('pend') ? 'pend' : st.includes('part') ? 'part' : 'ok';
};

// Links de busca para a fonte
const SITES = [
  [/^STF\b|SUPREMO TRIBUNAL FEDERAL/, 'jurisprudencia.stf.jus.br', 'Portal do STF'],
  [/^STJ\b|SUPERIOR TRIBUNAL DE JUSTICA/, 'scon.stj.jus.br', 'STJ'],
  [/^TEDH\b|TRIBUNAL EUROPEU/, 'hudoc.echr.coe.int', 'HUDOC'],
  [/^TJUE\b|TRIBUNAL DE JUSTICA DA UNIAO/, 'eur-lex.europa.eu', 'EUR-Lex'],
  [/^CORTE IDH|CORTE INTERAMERICANA/, 'corteidh.or.cr', 'Corte IDH'],
  [/^CORTE INTERNACIONAL DE JUSTICA|^CIJ\b/, 'icj-cij.org', 'CIJ'],
  [/^SUPREMA CORTE DOS ESTADOS UNIDOS/, 'supreme.justia.com', 'Justia'],
  [/^SUPREMA CORTE DO CANADA/, 'scc-csc.lexum.com', 'Lexum'],
  [/^CONSELHO CONSTITUCIONAL DA FRANCA/, 'conseil-constitutionnel.fr', 'Conseil constitutionnel'],
  [/^TRIBUNAL CONSTITUCIONAL DA ESPANHA/, 'hj.tribunalconstitucional.es', 'Tribunal Constitucional'],
  [/^COMISSAO DE VENEZA/, 'venice.coe.int', 'Comissão de Veneza'],
  [/^COMITE|^CDESC\b|^CERD\b|^RELATOR ESPECIAL/, 'ohchr.org', 'ONU (OHCHR)'],
  [/^UNESCO\b/, 'unesdoc.unesco.org', 'UNESDOC'],
  [/^OSCE\b/, 'osce.org', 'OSCE'],
  [/^BRASIL\b/, 'planalto.gov.br', 'Planalto'],
];
CF.links = (r, g) => {
  const plain = U.plain(r.html).replace(/\s+\d{4}[a-z]\.\s*$/, '').trim();
  const m = r.html.match(/<i>(.*?)<\/i>/); const title = m ? U.plain(m[1]).replace(/[:.]+$/, '') : '';
  const author = plain.split(/[.,(]/)[0].trim();
  const enc = encodeURIComponent; const L = [];
  if (r.url) L.push([r.url, 'Abrir fonte', 'primary']);
  if (g === 'doutrina' && title) {
    const q = `${title} ${author}`;
    L.push([`https://www.google.com/search?tbm=bks&q=${enc(q)}`, 'Google Livros']);
    L.push([`https://scholar.google.com/scholar?q=${enc(q)}`, 'Google Acadêmico']);
    L.push([`https://archive.org/search?query=${enc(title)}`, 'Internet Archive']);
  }
  const n = U.norm(plain); const site = SITES.find(([re]) => re.test(n));
  const q2 = plain.replace(/^[^.]+\.\s*/, '').slice(0, 180);
  if (site) L.push([`https://www.google.com/search?q=${enc('site:' + site[1] + ' ' + q2)}`, site[2]]);
  L.push([`https://www.google.com/search?q=${enc(g === 'doutrina' && title ? `"${title}" ${author}` : plain.slice(0, 200))}`, 'Google']);
  return L.map(([u, t, c]) => `<a href="${U.esc(u)}" target="_blank" rel="noopener" class="lk ${c || ''}">${U.esc(t)}</a>`).join('');
};

// Bloco de conferência de uma citação (usado no painel de notas e na tela geral)
CF.block = (it, RI, opt = {}) => {
  const ref = RI.get(it.c.key); const v = CF.get(it.k) || { st: 'pend', obs: '' };
  const btns = ['ok', 'part', 'no', 'pend'].map(st => `<button class="ck ck-${CK[st].cls} ${v.st === st ? 'on' : ''}" data-st="${st}" title="${CK[st].label}">${CK[st].ic} ${st === 'pend' ? 'Limpar' : CK[st].label}</button>`).join('');
  return `<div class="cf" data-k="${U.esc(it.k)}">
    ${opt.where ? `<div class="cf-where">${opt.where}</div>` : ''}
    <div class="cf-claim"><span class="muted">Afirmação:</span> “${U.esc(it.claim || '(não identificada)')}” <a href="#" data-copy title="Copiar a afirmação">copiar</a></div>
    <div class="cf-ref"><span class="muted">${U.esc(it.c.label)} →</span> ${ref ? ref.r.html : '<b style="color:#8a2a17">sem entrada nas referências</b>'}</div>
    ${ref ? `<div class="cf-links">${CF.links(ref.r, ref.g)}<a href="#" class="lk" data-url title="Guardar o endereço (ou o caminho do PDF) desta fonte">${ref.r.url ? 'alterar link' : '+ link da fonte'}</a></div>` : ''}
    <div class="cf-st">${btns}</div>
    <input type="text" class="cf-obs" placeholder="Observação (página, trecho conferido, divergência…)" value="${U.esc(v.obs)}">
    ${v.t && v.st !== 'pend' ? `<small class="muted">Conferido em ${U.fmtDate(v.t)}</small>` : ''}
  </div>`;
};
CF.wire = (root, items, RI, onChange) => {
  root.querySelectorAll('.cf').forEach(el => {
    const it = items.find(x => x.k === el.dataset.k); if (!it) return;
    el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { CF.set(it.k, b.dataset.st, el.querySelector('.cf-obs').value); onChange && onChange(); });
    const obs = el.querySelector('.cf-obs'); obs.onchange = () => { const v = CF.get(it.k); CF.set(it.k, v ? v.st : 'pend', obs.value); };
    const cp = el.querySelector('[data-copy]'); if (cp) cp.onclick = e => { e.preventDefault(); navigator.clipboard && navigator.clipboard.writeText(it.claim); U.toast('Afirmação copiada.'); };
    const u = el.querySelector('[data-url]'); if (u) u.onclick = e => { e.preventDefault(); const ref = RI.get(it.c.key); if (!ref) return; const n = prompt('Endereço da fonte (página do livro, PDF, acórdão…). Deixe em branco para remover.', ref.r.url || ''); if (n === null) return; if (n.trim()) ref.r.url = n.trim(); else delete ref.r.url; touch(); onChange && onChange(); };
  });
};

// Tela geral de conferência
function showConfere(filt = 'pend', q = '', limit = 60) {
  commit();
  const RI = CF.refIndex(); const L = labels();
  const all = order().flatMap(o => CF.items(o.s).map(it => ({ ...it, o })));
  const cnt = { ok: 0, part: 0, no: 0, pend: 0 }; all.forEach(it => cnt[CF.status(it)]++);
  const nq = U.norm(q);
  const list = all.filter(it => (filt === 'todos' || CF.status(it) === filt) && (!nq || U.norm(it.c.label + ' ' + it.claim + ' ' + (RI.get(it.c.key) ? U.plain(RI.get(it.c.key).r.html) : '')).includes(nq)));
  const pct = all.length ? Math.round(100 * (cnt.ok + cnt.part + cnt.no) / all.length) : 0;
  let h = `<p class="muted" style="font-size:12px">Cada citação das notas aparece com a afirmação que ela sustenta no texto e a referência completa. Abra a fonte, confira se ela diz o que o texto diz que ela diz e marque o resultado. Se você reescrever a afirmação depois, ela volta para “a conferir”.</p>
  <div class="cf-sum"><b>${pct}% conferido</b> · ${all.length} citações · <span class="ck-ok">✓ ${cnt.ok}</span> · <span class="ck-part">≈ ${cnt.part}</span> · <span class="ck-no">✗ ${cnt.no}</span> · <span class="muted">a conferir ${cnt.pend}</span></div>
  <div class="formrow"><select id="cfF">${[['pend', 'A conferir'], ['no', 'Não confere'], ['part', 'Confere em parte'], ['ok', 'Confere'], ['todos', 'Todas']].map(([v, t]) => `<option value="${v}" ${v === filt ? 'selected' : ''}>${t}</option>`).join('')}</select><input type="text" id="cfQ" placeholder="filtrar por autor, tribunal, palavra…" value="${U.esc(q)}"></div>`;
  if (!list.length) h += '<p class="muted">Nenhuma citação neste filtro.</p>';
  const shown = list.slice(0, limit);
  h += shown.map(it => CF.block(it, RI, { where: `<a href="#" data-gosec="${it.o.s.id}" data-ni="${it.ni}">${L.short[it.o.c.id]}${it.o.sn ? '.' + it.o.sn : ''} · ${U.esc(secLabel(it.o.s)).slice(0, 60)} · nota ${noteStart(it.o.s.id) + it.ni}</a>` })).join('');
  if (list.length > limit) h += `<p><button id="cfMore">Mostrar mais (${list.length - limit} restantes)</button></p>`;
  modal('Conferência de fontes', h);
  const body = $('#modalbody'); const keep = () => body.scrollTop;
  const re = () => { const st = keep(); showConfere($('#cfF').value, $('#cfQ').value, limit); $('#modalbody').scrollTop = st; };
  CF.wire(body, shown, RI, re);
  $('#cfF').onchange = () => showConfere($('#cfF').value, $('#cfQ').value);
  $('#cfQ').oninput = U.debounce(() => showConfere($('#cfF').value, $('#cfQ').value), 350);
  const more = $('#cfMore'); if (more) more.onclick = () => { const st = keep(); showConfere(filt, q, limit + 60); $('#modalbody').scrollTop = st; };
  body.querySelectorAll('[data-gosec]').forEach(a => a.onclick = e => { e.preventDefault(); closeModal(); openSection(a.dataset.gosec); selNote = +a.dataset.ni; decorate(); setTab('notes'); setTimeout(() => { const f = editor().querySelectorAll('.fn')[selNote]; if (f) f.scrollIntoView({ block: 'center' }); }, 80); });
}
