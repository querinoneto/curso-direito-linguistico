// Sistema de revisão do livro — lógica principal
const STATUS = {
  pendente: { label: 'Pendente', hint: 'Ainda não revisada' },
  revisao: { label: 'Em revisão', hint: 'Revisão começada' },
  corrigido: { label: 'Corrigido', hint: 'Revisão concluída' },
  travado: { label: 'Travado', hint: 'Concluído e protegido contra edição' },
};
const DONE = s => s.status === 'corrigido' || s.status === 'travado';

let D = null, H = {}, UNDO = {}, ORIG = null, cur = null, tab = 'notes', selNote = -1, selComment = null, dirty = false;
const $ = s => document.querySelector(s);
const editor = () => $('#editor');

// ---------------- estrutura ----------------
function order() {
  const out = []; let gc = 0;
  const L = labels(); D.parts.forEach((p, pi) => p.chapters.forEach((c) => { gc++; let n = 0; c.sections.forEach((s, si) => { if (!s.intro) n++; out.push({ p, c, s, pi, cn: L.short[c.id], cg: gc, si, sn: s.intro ? 0 : n }); }); }));
  return out;
}
function find(id) { return order().find(o => o.s.id === id); }
// Numeração: partes em romanos e capítulos corridos; a parte de apêndices (kind: 'apendices') não entra na contagem
function chapterNums() { const m = {}; let n = 0, np = 0; D.parts.forEach(p => { if (p.kind === 'apendices') { m[p.id] = ''; p.chapters.forEach((c, i) => { m[c.id] = U.roman(i + 1); }); } else { m[p.id] = U.roman(++np); p.chapters.forEach(c => { m[c.id] = ++n; }); } }); return m; }
function labels() {
  const m = chapterNums(), part = {}, ch = {}, short = {};
  D.parts.forEach(p => { const ap = p.kind === 'apendices'; part[p.id] = ap ? 'Apêndices' : `Parte ${m[p.id]}`; p.chapters.forEach(c => { ch[c.id] = ap ? `Apêndice ${m[c.id]}` : `Capítulo ${m[c.id]}`; short[c.id] = ap ? `Ap. ${m[c.id]}` : `Cap. ${m[c.id]}`; }); });
  return { part, ch, short, nums: m };
}
const secLabel = s => s.intro ? 'Abertura do capítulo' : U.plain(s.title || '(sem título)');
const WC = new Map();
function words(s) { const c = WC.get(s.id); if (c && c.h === s.html) return c.w; const w = U.countWords(U.plain(s.html)); WC.set(s.id, { h: s.html, w }); return w; }
function noteStart(id) { let n = 0; for (const o of order()) { if (o.s.id === id) break; n += (o.s.html.match(/class="fn"/g) || []).length; } return n + 1; }

// ---------------- salvar ----------------
function setSave(t, cls = '') { const e = $('#savestate'); e.textContent = t; e.className = cls; }
const persist = U.debounce(async () => {
  try {
    D.updated = new Date().toISOString();
    await DB.set('data', D);
    dirty = false;
    setSave('Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    autoSync();
  } catch (e) { setSave('Erro ao salvar: ' + e.message, 'err'); }
}, 700);
function touch() { dirty = true; setSave('Salvando…', 'dirty'); persist(); }
const persistHist = U.debounce(() => DB.set('history', H), 1500);
const persistUndo = U.debounce(() => DB.set('undo', UNDO), 2000);
const autoSync = U.debounce(async () => {
  const c = Sync.cfg(); if (!Sync.ok() || !c.auto) return;
  try { await Sync.push(D); localStorage.setItem('cdl-lastsync', new Date().toISOString()); setSave($('#savestate').textContent.replace(/ · .*/, '') + ' · no GitHub'); }
  catch (e) { setSave('Salvo localmente · GitHub: ' + e.message, 'err'); }
}, 45000);

function snapshot(s, label = '') {
  const h = H[s.id] = H[s.id] || [];
  const last = h[h.length - 1];
  if (last && last.html === s.html && last.title === s.title && !label) return;
  h.push({ t: Date.now(), html: s.html, title: s.title, status: s.status, label });
  if (h.length > 80) { const i = h.findIndex(x => !x.label); h.splice(i >= 0 ? i : 0, 1); }
  persistHist();
}

// ---------------- editor ----------------
let commitTimer = null;
function scheduleCommit() { dirty = true; setSave('Salvando…', 'dirty'); clearTimeout(commitTimer); commitTimer = setTimeout(commit, 400); }
function commit() {
  clearTimeout(commitTimer); commitTimer = null;
  if (!cur) return;
  const o = find(cur); if (!o) return;
  const s = o.s;
  const h = U.cleanHTML(editor());
  let changed = false;
  if (h !== s.html) { s.html = h; changed = true; pushUndo(s.id, h); }
  if (!s.intro) {
    const tt = U.cleanHTML($('#sectitle')).replace(/^<p>|<\/p>$/g, '').trim();
    if (tt && tt !== s.title) { s.title = tt; changed = true; renderToc(); }
  }
  if (changed) {
    s.updated = Date.now();
    if (s.status === 'pendente') { s.status = 'revisao'; renderStatus(); renderToc(); }
    const hs = H[s.id] || []; if (!hs.length || Date.now() - hs[hs.length - 1].t > 10 * 60e3) snapshot(s, '');
    decorate(); touch(); refreshPanelSoft();
  } else if (dirty && !persist.pending) { setSave('Salvo'); dirty = false; }
}
function pushUndo(id, h) {
  const u = UNDO[id] = UNDO[id] || { s: [], i: -1 };
  if (u.s[u.i] === h) return;
  u.s = u.s.slice(0, u.i + 1); u.s.push(h);
  if (u.s.length > 200) u.s.shift();
  u.i = u.s.length - 1; persistUndo();
}
function undoRedo(dir) {
  if (!cur) return; commit();
  const s = find(cur).s; if (s.status === 'travado') return;
  const u = UNDO[s.id]; if (!u) return;
  const ni = u.i + dir; if (ni < 0 || ni >= u.s.length) { U.toast(dir < 0 ? 'Nada mais a desfazer.' : 'Nada a refazer.'); return; }
  u.i = ni; s.html = u.s[ni]; s.updated = Date.now();
  editor().innerHTML = s.html; decorate(); touch(); persistUndo(); renderPanel();
}

function decorate() {
  const ed = editor(); if (!cur) return;
  let n = noteStart(cur);
  ed.querySelectorAll('.fn').forEach((f, i) => { f.contentEditable = 'false'; f.dataset.n = n + i; f.classList.toggle('empty', !f.dataset.note); f.classList.toggle('sel', i === selNote); f.title = f.dataset.note || '(nota vazia)'; });
  const nums = chapterNums();
  ed.querySelectorAll('.xref').forEach(x => {
    x.contentEditable = 'false'; const t = x.dataset.target;
    if (nums[t] === undefined) { x.title = 'Remissão a um capítulo ou parte que não existe mais'; x.style.borderBottomColor = 'red'; return; }
    const txt = /^p/.test(t) ? `Parte ${nums[t]}` : `Capítulo ${nums[t]}`;
    if (x.textContent !== txt) x.textContent = txt;
    x.title = 'Remissão automática: o número se atualiza se a ordem mudar';
  });
  ed.querySelectorAll('mark.cm').forEach(m => m.classList.toggle('sel', m.dataset.id === selComment));
}

function openSection(id, opt = {}) {
  if (cur && cur !== id) { commit(); const o = find(cur); if (o) snapshot(o.s, ''); }
  const o = find(id); if (!o) return;
  cur = id; localStorage.setItem('cdl-cur', id); selNote = -1; selComment = null;
  const s = o.s;
  const nums = chapterNums();
  const L = labels(); $('#crumb').innerHTML = `${o.p.kind === 'apendices' ? '' : L.part[o.p.id] + ' · '}${U.esc(U.plain(o.p.title))} › ${L.ch[o.c.id]} · ${U.esc(U.plain(o.c.title))}`;
  const t = $('#sectitle');
  if (s.intro) { t.textContent = 'Abertura do capítulo (texto antes da primeira seção)'; t.contentEditable = 'false'; t.className = 'intro'; }
  else { t.innerHTML = s.title; t.contentEditable = s.status === 'travado' ? 'false' : 'true'; t.className = ''; }
  editor().innerHTML = s.html;
  editor().contentEditable = s.status === 'travado' ? 'false' : 'true';
  $('#center').classList.toggle('locked', s.status === 'travado');
  const u = UNDO[s.id]; if (!u || u.s[u.i] !== s.html) pushUndo(s.id, s.html);
  snapshot(s, '');
  decorate(); renderStatus(); renderToc(); renderPanel();
  if (!opt.keepScroll) $('#center').scrollTop = 0;
  if (window.innerWidth < 760) document.body.classList.remove('showside');
}

function renderStatus() {
  const s = find(cur).s;
  $('#statusbar').innerHTML = Object.entries(STATUS).map(([k, v]) => `<button class="st ${s.status === k ? 'on' : ''}" data-st="${k}" title="${v.hint}"><span class="dot ${k}"></span>${v.label}</button>`).join('') +
    `<span class="muted" style="margin-left:8px;font-size:12px">${words(s).toLocaleString('pt-BR')} palavras${s.updated ? ' · alterada em ' + U.fmtDate(s.updated) : ''}</span>`;
  $('#statusbar').querySelectorAll('[data-st]').forEach(b => b.onclick = () => setStatus(b.dataset.st));
  document.querySelectorAll('#toolbar button').forEach(b => { if (!['history', 'diff'].includes(b.dataset.cmd)) b.disabled = s.status === 'travado'; });
}
function setStatus(st) {
  commit();
  const s = find(cur).s; if (s.status === st) return;
  s.status = st; s.updated = Date.now();
  if (st === 'corrigido' || st === 'travado') snapshot(s, st === 'corrigido' ? 'Marcada como corrigida' : 'Travada');
  touch(); openSection(cur, { keepScroll: true }); renderProgress();
  if (st === 'corrigido') { const n = nextToFix(); if (n) U.toast(`Seção marcada como corrigida. Próxima: ${secLabel(n.s)} (Alt+N)`, 4000); else U.toast('Seção marcada como corrigida. Não há mais seções pendentes!', 4000); }
}
function nextToFix(fromId = cur) {
  const ord = order(); const i = ord.findIndex(o => o.s.id === fromId);
  return ord.slice(i + 1).find(o => !DONE(o.s)) || ord.slice(0, i).find(o => !DONE(o.s));
}

// ---------------- sumário (barra lateral) ----------------
function renderToc() {
  const nums = chapterNums(); let h = '';
  D.parts.forEach((p, pi) => {
    h += `<div class="toc-part"><div class="row" data-part="${p.id}"><span class="t">${p.kind === 'apendices' ? '' : labels().part[p.id] + ' — '}${p.title}</span><span class="acts"><button data-a="ren-part" title="Renomear">✎</button><button data-a="add-ch" title="Novo capítulo">+ cap.</button><button data-a="del-part" title="Excluir parte">✕</button></span></div>`;
    p.chapters.forEach(c => {
      const st = { pendente: 0, revisao: 0, corrigido: 0, travado: 0 }; let tot = 0;
      c.sections.forEach(s => { const w = words(s); st[s.status] += w; tot += w; });
      const pc = k => tot ? (st[k] / tot * 100).toFixed(1) : 0;
      h += `<div class="toc-ch"><div class="row" data-ch="${c.id}"><span class="num">${nums[c.id]}.</span><span class="t">${c.title}</span><span class="acts"><button data-a="up-ch" title="Subir">↑</button><button data-a="down-ch" title="Descer">↓</button><button data-a="ren-ch" title="Renomear">✎</button><button data-a="add-sec" title="Nova seção">+</button><button data-a="del-ch" title="Excluir capítulo">✕</button></span></div>`;
      h += `<div class="chbar"><span class="b-ok" style="width:${pc('corrigido')}%;background:var(--ok)"></span><span style="width:${pc('travado')}%;background:var(--lock)"></span><span style="width:${pc('revisao')}%;background:var(--rev)"></span></div>`;
      let n = 0;
      c.sections.forEach(s => {
        if (!s.intro) n++;
        h += `<div class="toc-sec"><div class="row ${s.id === cur ? 'active' : ''}" data-sec="${s.id}" title="${STATUS[s.status].label}"><span class="dot ${s.status}"></span><span class="num">${s.intro ? '' : n + '.'}</span><span class="t">${s.intro ? '<i class="muted">Abertura do capítulo</i>' : s.title}</span>${(s.comments || []).some(k => !k.resolved) ? '<span title="Há comentários abertos">💬</span>' : ''}<span class="acts"><button data-a="up-sec" title="Subir">↑</button><button data-a="down-sec" title="Descer">↓</button><button data-a="del-sec" title="Excluir seção">✕</button></span></div></div>`;
      });
      h += `</div>`;
    });
    h += `</div>`;
  });
  h += `<div class="toc-add" data-a="add-part">+ Nova parte</div>`;
  $('#toc').innerHTML = h;
}
$('#toc').addEventListener('click', e => {
  const btn = e.target.closest('[data-a]'); const row = e.target.closest('.row');
  if (btn) { e.stopPropagation(); return tocAction(btn.dataset.a, row); }
  if (row && row.dataset.sec) openSection(row.dataset.sec);
  else if (row && row.dataset.ch) { const c = allChapters().find(c => c.id === row.dataset.ch); if (c && c.sections[0]) openSection(c.sections[0].id); }
});
function allChapters() { return D.parts.flatMap(p => p.chapters); }
function tocAction(a, row) {
  commit();
  const pid = row && row.dataset.part, cid = row && row.dataset.ch, sid = row && row.dataset.sec;
  const P = D.parts;
  const locCh = id => { for (const p of P) { const i = p.chapters.findIndex(c => c.id === id); if (i >= 0) return { p, i }; } };
  const locSec = id => { for (const p of P) for (const c of p.chapters) { const i = c.sections.findIndex(s => s.id === id); if (i >= 0) return { p, c, i }; } };
  if (a === 'add-part') { const t = prompt('Título da nova parte:'); if (!t) return; P.push({ id: U.uid('p'), title: U.esc(t), chapters: [] }); }
  if (a === 'ren-part') { const p = P.find(p => p.id === pid); const t = prompt('Título da parte:', U.plain(p.title)); if (!t) return; p.title = U.esc(t); }
  if (a === 'del-part') { const p = P.find(p => p.id === pid); if (p.chapters.length) return U.toast('Esvazie a parte (mova ou exclua os capítulos) antes de excluí-la.'); if (!confirm('Excluir esta parte?')) return; P.splice(P.indexOf(p), 1); }
  if (a === 'add-ch') { const p = P.find(p => p.id === pid); const t = prompt('Título do novo capítulo:'); if (!t) return; const c = { id: U.uid('c'), title: U.esc(t), sections: [{ id: U.uid('s'), title: null, intro: true, status: 'pendente', html: '<p></p>', comments: [] }] }; p.chapters.push(c); touch(); renderToc(); return openSection(c.sections[0].id); }
  if (a === 'ren-ch') { const c = allChapters().find(c => c.id === cid); const t = prompt('Título do capítulo:', U.plain(c.title)); if (!t) return; c.title = U.esc(t); }
  if (a === 'del-ch') { const { p, i } = locCh(cid); const c = p.chapters[i]; if (!confirm(`Excluir o capítulo “${U.plain(c.title)}” e todas as suas seções? (Fica guardado na lixeira do backup.)`)) return; (D.trash = D.trash || []).push({ t: Date.now(), chapter: c }); p.chapters.splice(i, 1); if (c.sections.some(s => s.id === cur)) cur = null; }
  if (a === 'up-ch' || a === 'down-ch') {
    const { p, i } = locCh(cid); const pi = P.indexOf(p); const c = p.chapters[i];
    if (a === 'up-ch') { if (i > 0) [p.chapters[i - 1], p.chapters[i]] = [c, p.chapters[i - 1]]; else if (pi > 0) { p.chapters.splice(i, 1); P[pi - 1].chapters.push(c); } }
    else { if (i < p.chapters.length - 1) [p.chapters[i + 1], p.chapters[i]] = [c, p.chapters[i + 1]]; else if (pi < P.length - 1) { p.chapters.splice(i, 1); P[pi + 1].chapters.unshift(c); } }
    U.toast('Capítulo movido. Numeração e remissões atualizadas.');
  }
  if (a === 'add-sec') { const c = allChapters().find(c => c.id === cid); const t = prompt('Título da nova seção:'); if (!t) return; const s = { id: U.uid('s'), title: U.esc(t), status: 'pendente', html: '<p></p>', comments: [] }; c.sections.push(s); touch(); renderToc(); return openSection(s.id); }
  if (a === 'del-sec') { const { c, i } = locSec(sid); const s = c.sections[i]; if (!confirm(`Excluir a seção “${secLabel(s)}”? (Fica guardada na lixeira do backup.)`)) return; (D.trash = D.trash || []).push({ t: Date.now(), section: s, chapter: c.id }); c.sections.splice(i, 1); if (sid === cur) cur = null; }
  if (a === 'up-sec' || a === 'down-sec') {
    const { c, i } = locSec(sid); const chs = allChapters(); const ci = chs.indexOf(c); const s = c.sections[i];
    if (a === 'up-sec') { if (i > 0) [c.sections[i - 1], c.sections[i]] = [s, c.sections[i - 1]]; else if (ci > 0) { c.sections.splice(i, 1); chs[ci - 1].sections.push(s); } }
    else { if (i < c.sections.length - 1) [c.sections[i + 1], c.sections[i]] = [s, c.sections[i + 1]]; else if (ci < chs.length - 1) { c.sections.splice(i, 1); chs[ci + 1].sections.unshift(s); } }
  }
  touch(); renderToc(); renderProgress();
  if (!cur || !find(cur)) { const f = order()[0]; cur = null; if (f) openSection(f.s.id); }
  else openSection(cur, { keepScroll: true });
}

// ---------------- progresso ----------------
function stats(list) {
  const r = { pendente: 0, revisao: 0, corrigido: 0, travado: 0, tot: 0, secs: { pendente: 0, revisao: 0, corrigido: 0, travado: 0 }, n: 0 };
  list.forEach(s => { const w = words(s); r[s.status] += w; r.tot += w; r.secs[s.status]++; r.n++; });
  r.done = r.corrigido + r.travado; r.pct = r.tot ? r.done / r.tot * 100 : 0; r.ndone = r.secs.corrigido + r.secs.travado;
  return r;
}
const barHTML = r => `<div class="bar"><span class="b-ok" style="width:${r.tot ? r.corrigido / r.tot * 100 : 0}%"></span><span class="b-lock" style="width:${r.tot ? r.travado / r.tot * 100 : 0}%"></span><span class="b-rev" style="width:${r.tot ? r.revisao / r.tot * 100 : 0}%"></span></div>`;
function renderProgress() {
  const r = stats(order().map(o => o.s));
  $('#progbox').innerHTML = `<div style="display:flex;justify-content:space-between;font-weight:600;margin-bottom:6px"><span>Revisão do livro</span><span>${r.pct.toFixed(1)}%</span></div>${barHTML(r)}<small>${r.done.toLocaleString('pt-BR')} de ${r.tot.toLocaleString('pt-BR')} palavras · ${r.ndone} de ${r.n} seções corrigidas</small>`;
  $('#progbox').onclick = showProgress; $('#progbox').style.cursor = 'pointer';
}
function showProgress() {
  const nums = chapterNums(); const all = stats(order().map(o => o.s));
  let h = `<div class="legend"><span><span class="dot corrigido"></span>Corrigido</span><span><span class="dot travado"></span>Travado</span><span><span class="dot revisao"></span>Em revisão</span><span><span class="dot pendente"></span>Pendente</span></div>`;
  h += `<p><b>Livro inteiro:</b> ${all.pct.toFixed(1)}% das palavras revisadas · ${all.ndone} de ${all.n} seções (${all.secs.revisao} em revisão, ${all.secs.pendente} pendentes).</p>${barHTML(all)}<br>`;
  D.parts.forEach(p => {
    const pr = stats(p.chapters.flatMap(c => c.sections));
    h += `<h4>${p.kind === 'apendices' ? '' : labels().part[p.id] + ' — '}${p.title} · ${pr.pct.toFixed(0)}%</h4><div class="stat-grid">`;
    p.chapters.forEach(c => { const cr = stats(c.sections); h += `<span>${nums[c.id]}. ${c.title}</span>${barHTML(cr)}<span class="muted">${cr.pct.toFixed(0)}% · ${cr.ndone}/${cr.n} seções · ${cr.tot.toLocaleString('pt-BR')} pal.</span>`; });
    h += `</div>`;
  });
  const n = nextToFix(); if (n) h += `<p style="margin-top:18px"><button class="primary" id="goNext">Ir para a próxima a corrigir: ${U.esc(secLabel(n.s))}</button></p>`;
  modal('Progresso da revisão', h);
  const g = $('#goNext'); if (g) g.onclick = () => { closeModal(); openSection(n.s.id); };
}

// ---------------- painel lateral ----------------
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); renderPanel(); });
function setTab(t) { tab = t; document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === t)); if (window.innerWidth < 1100) document.body.classList.add('showpanel'); renderPanel(); }
const refreshPanelSoft = U.debounce(() => { if (tab === 'checks' || tab === 'queue') renderPanel(); }, 1200);
function renderPanel() {
  if (!cur) return; const s = find(cur).s; const pane = $('#pane');
  if (tab === 'notes') {
    const fns = [...editor().querySelectorAll('.fn')];
    let h = `<div class="muted" style="margin-bottom:10px;font-size:12px">Notas desta seção. Clique numa nota no texto para editá-la aqui. Use <b>¹ Nota</b> (Ctrl+Alt+N) para inserir.</div>`;
    if (!fns.length) h += `<p class="muted">Nenhuma nota nesta seção.</p>`;
    h += fns.map((f, i) => `<div class="note-item ${i === selNote ? 'sel' : ''}" data-i="${i}"><span class="n">${f.dataset.n}</span><input type="text" list="citlist" value="${U.esc(f.dataset.note || '')}" placeholder="AUTOR, ano." ${s.status === 'travado' ? 'disabled' : ''}><button title="Localizar no texto" data-go>⌖</button>${s.status === 'travado' ? '' : '<button title="Excluir nota" data-del>✕</button>'}</div>`).join('');
    const keys = [...new Set([...D.refs.doutrina, ...D.refs.jurisprudencia].map(r => { const [a, y] = U.refKey(r.html).split('|'); return `${a}, ${y}.`; }))];
    h += `<datalist id="citlist">${keys.map(k => `<option value="${U.esc(k)}">`).join('')}</datalist>`;
    const cits = fns.flatMap(f => U.citations(f.dataset.note || '')); const known = refKeySet();
    const miss = [...new Set(cits.filter(c => !known.has(c.key)).map(c => c.label))];
    if (miss.length) h += `<div class="issue" style="margin-top:12px"><b>Citações sem referência na lista</b>${miss.map(U.esc).join('; ')}<br><a href="#" id="openRefs">Abrir referências</a></div>`;
    pane.innerHTML = h;
    pane.querySelectorAll('.note-item').forEach(it => {
      const i = +it.dataset.i, f = fns[i];
      const inp = it.querySelector('input');
      inp.oninput = () => { f.dataset.note = inp.value; f.classList.toggle('empty', !inp.value); f.title = inp.value; scheduleCommit(); };
      inp.onfocus = () => { selNote = i; decorate(); };
      it.querySelector('[data-go]').onclick = () => { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); selNote = i; decorate(); };
      const del = it.querySelector('[data-del]'); if (del) del.onclick = () => { if (!confirm('Excluir esta nota?')) return; f.remove(); selNote = -1; commit(); renderPanel(); };
    });
    const or = $('#openRefs'); if (or) or.onclick = e => { e.preventDefault(); showRefs(); };
    if (selNote >= 0) { const it = pane.querySelector(`.note-item[data-i="${selNote}"] input`); if (it) { it.scrollIntoView({ block: 'nearest' }); } }
  }
  if (tab === 'comments') {
    const cs = s.comments || [];
    let h = `<div class="muted" style="margin-bottom:10px;font-size:12px">Selecione um trecho e clique em <b>💬 Comentar</b> (Ctrl+Alt+M). Para um comentário geral sobre a seção, clique em “Novo comentário”.</div><button id="newCm">Novo comentário</button><br><br>`;
    if (!cs.length) h += `<p class="muted">Nenhum comentário.</p>`;
    h += cs.map(c => `<div class="cm-item ${c.resolved ? 'resolved' : ''} ${c.id === selComment ? 'sel' : ''}" data-id="${c.id}">${c.quote ? `<q>${U.esc(c.quote)}</q>` : ''}<textarea placeholder="Escreva o comentário ou a pendência…">${U.esc(c.text)}</textarea><div class="acts"><small class="muted" style="flex:1">${U.fmtDate(c.created)}</small><button data-go>⌖</button><button data-res>${c.resolved ? 'Reabrir' : 'Resolver'}</button><button data-del>✕</button></div></div>`).join('');
    pane.innerHTML = h;
    $('#newCm').onclick = () => { const c = { id: U.uid('k'), text: '', quote: '', resolved: false, created: new Date().toISOString() }; (s.comments = s.comments || []).unshift(c); selComment = c.id; touch(); renderPanel(); renderToc(); pane.querySelector('textarea').focus(); };
    pane.querySelectorAll('.cm-item').forEach(it => {
      const c = cs.find(x => x.id === it.dataset.id);
      it.querySelector('textarea').oninput = e => { c.text = e.target.value; touch(); };
      it.querySelector('[data-go]').onclick = () => { selComment = c.id; decorate(); const m = editor().querySelector(`mark.cm[data-id="${c.id}"]`); if (m) m.scrollIntoView({ block: 'center', behavior: 'smooth' }); else U.toast('Comentário sem trecho marcado no texto.'); };
      it.querySelector('[data-res]').onclick = () => { c.resolved = !c.resolved; if (c.resolved) unwrapMark(c.id); touch(); renderPanel(); renderToc(); };
      it.querySelector('[data-del]').onclick = () => { if (!confirm('Excluir este comentário?')) return; unwrapMark(c.id); s.comments.splice(s.comments.indexOf(c), 1); touch(); renderPanel(); renderToc(); };
    });
    if (selComment) { const it = pane.querySelector(`.cm-item[data-id="${selComment}"]`); if (it) it.scrollIntoView({ block: 'nearest' }); }
  }
  if (tab === 'checks') {
    const names = Checks.surnames(D);
    const au = Checks.authorsInBody(s.html, names), st = Checks.style(s.html);
    let h = `<h4>Autores no corpo do texto (${au.length})</h4><div class="muted" style="font-size:12px;margin-bottom:8px">Pela regra do livro, o crédito ao autor vai só na nota de rodapé.</div>`;
    h += au.length ? au.map((x, i) => `<div class="issue" data-term="${U.esc(x.term)}"><b>${U.esc(x.name)}</b>…${U.esc(x.ctx)}…<br><a href="#" data-ign="${U.esc(x.name)}" style="font-size:11px">não é autor citado: ignorar este nome</a></div>`).join('') : '<p class="muted">Nenhum nome de autor no corpo do texto.</p>';
    h += `<h4>Estilo (${st.length})</h4>`;
    h += st.length ? st.map(x => `<div class="issue info" data-term="${U.esc(x.term)}"><b>${U.esc(x.msg)}</b>${U.esc(x.ctx)}</div>`).join('') : '<p class="muted">Nenhum alerta de estilo.</p>';
    pane.innerHTML = h;
    pane.querySelectorAll('.issue').forEach(it => it.onclick = e => { if (e.target.dataset.ign) { e.preventDefault(); (D.ignoreNames = D.ignoreNames || []).push(e.target.dataset.ign); touch(); renderPanel(); return; } reveal(it.dataset.term); });
  }
  if (tab === 'queue') {
    const ord = order(); const i = ord.findIndex(o => o.s.id === cur);
    const nexts = ord.slice(i + 1).filter(o => !DONE(o.s)).slice(0, 2);
    const item = (o, cls, lbl) => `<div class="queue-item ${cls}" data-sec="${o.s.id}"><small>${lbl} · ${o.cn}${o.sn ? ', seção ' + o.sn : ''} · ${STATUS[o.s.status].label}</small><div><span class="dot ${o.s.status}" style="display:inline-block"></span> ${U.esc(secLabel(o.s))}</div><small>${words(o.s).toLocaleString('pt-BR')} palavras</small></div>`;
    let h = `<h4>Agora</h4>` + item(ord[i], 'cur', 'Seção atual') + `<h4>A seguir</h4>`;
    h += nexts.length ? nexts.map((o, k) => item(o, '', k ? 'Depois' : 'Próxima')).join('') : '<p class="muted">Não há seções pendentes depois desta.</p>';
    const first = ord.find(o => !DONE(o.s));
    if (first && first.s.id !== cur && !nexts.includes(first)) h += `<h4>Primeira pendente do livro</h4>` + item(first, '', 'Pendente');
    pane.innerHTML = h;
    pane.querySelectorAll('.queue-item').forEach(it => it.onclick = () => openSection(it.dataset.sec));
  }
}
function unwrapMark(id) { const m = editor().querySelector(`mark.cm[data-id="${id}"]`); if (m) { m.replaceWith(...m.childNodes); commit(); } else { const o = find(cur); o.s.html = o.s.html.replace(new RegExp(`<mark class="cm" data-id="${id}">([\\s\\S]*?)</mark>`), '$1'); } }
function reveal(term) {
  if (!term) return;
  const ed = editor(); const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n;
  const t = term.slice(0, 40);
  while ((n = w.nextNode())) {
    const k = n.nodeValue.indexOf(t);
    if (k >= 0) { const r = document.createRange(); r.setStart(n, k); r.setEnd(n, Math.min(n.nodeValue.length, k + t.length)); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); n.parentElement.scrollIntoView({ block: 'center', behavior: 'smooth' }); return true; }
  }
  return false;
}
function refKeySet() { return new Set([...D.refs.doutrina, ...D.refs.jurisprudencia].map(r => U.refKey(r.html))); }

// ---------------- eventos do editor ----------------
document.execCommand('defaultParagraphSeparator', false, 'p');
editor().addEventListener('input', scheduleCommit);
$('#sectitle').addEventListener('input', scheduleCommit);
$('#sectitle').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); editor().focus(); } });
editor().addEventListener('click', e => {
  const f = e.target.closest('.fn');
  if (f) { selNote = [...editor().querySelectorAll('.fn')].indexOf(f); decorate(); setTab('notes'); setTimeout(() => { const i = $('#pane').querySelector(`.note-item[data-i="${selNote}"] input`); if (i) i.focus(); }, 30); return; }
  const m = e.target.closest('mark.cm');
  if (m) { selComment = m.dataset.id; decorate(); setTab('comments'); }
});
editor().addEventListener('paste', e => {
  e.preventDefault();
  const cd = e.clipboardData; let h = cd.getData('text/html');
  if (h) { const d = document.createElement('div'); d.innerHTML = h; d.querySelectorAll('style,script,meta,title,o\\:p').forEach(x => x.remove()); h = U.cleanHTML(d); }
  else h = (cd.getData('text/plain') || '').split(/\n\s*\n|\r?\n/).filter(x => x.trim()).map(x => `<p>${U.esc(x.trim())}</p>`).join('');
  const ps = h.match(/<p>/g) || [];
  if (ps.length <= 1) h = h.replace(/^<p>|<\/p>$/g, '');
  document.execCommand('insertHTML', false, h);
});
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  const inEd = editor().contains(document.activeElement) || document.activeElement === editor() || document.activeElement === $('#sectitle');
  if (mod && !e.altKey && k === 'z' && inEd) { e.preventDefault(); undoRedo(e.shiftKey ? 1 : -1); }
  else if (mod && k === 'y' && inEd) { e.preventDefault(); undoRedo(1); }
  else if (mod && e.altKey && k === 'n') { e.preventDefault(); cmd('note'); }
  else if (mod && e.altKey && k === 'm') { e.preventDefault(); cmd('comment'); }
  else if (mod && e.shiftKey && k === 'f') { e.preventDefault(); showSearch(); }
  else if (mod && k === 's') { e.preventDefault(); commit(); persist.flush(); autoSync.flush(); }
  else if (e.altKey && k === 'n' && !mod) { e.preventDefault(); goNext(); }
  else if (k === 'escape' && !$('#modal').classList.contains('hidden')) closeModal();
});
document.querySelectorAll('#toolbar button').forEach(b => b.onmousedown = e => e.preventDefault());
document.querySelectorAll('#toolbar button').forEach(b => b.onclick = () => cmd(b.dataset.cmd));

function selRangeInEditor() {
  const sel = getSelection(); if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0); if (!editor().contains(r.commonAncestorContainer)) return null; return r;
}
function cmd(c) {
  if (!cur) return; const s = find(cur).s;
  if (s.status === 'travado' && !['history', 'diff'].includes(c)) return U.toast('Seção travada. Mude o estado para editar.');
  if (c === 'italic' || c === 'bold') { document.execCommand(c); scheduleCommit(); }
  if (c === 'plain') { document.execCommand('removeFormat'); scheduleCommit(); }
  if (c === 'undo') undoRedo(-1);
  if (c === 'redo') undoRedo(1);
  if (c === 'quote') {
    const r = selRangeInEditor(); if (!r) return U.toast('Coloque o cursor no parágrafo que será citação.');
    const p = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement).closest('#editor > p, #editor > blockquote');
    if (!p) return;
    if (p.tagName === 'BLOCKQUOTE') p.replaceWith(...p.childNodes); else { const bq = document.createElement('blockquote'); p.replaceWith(bq); bq.appendChild(p); }
    commit();
  }
  if (c === 'note') {
    let r = selRangeInEditor();
    if (!r) return U.toast('Clique no ponto do texto onde a nota deve entrar.');
    r = r.cloneRange(); r.collapse(false);
    const f = document.createElement('span'); f.className = 'fn'; f.dataset.note = ''; f.contentEditable = 'false';
    r.insertNode(f);
    const sel = getSelection(); const r2 = document.createRange(); r2.setStartAfter(f); r2.collapse(true); sel.removeAllRanges(); sel.addRange(r2);
    commit(); selNote = [...editor().querySelectorAll('.fn')].indexOf(f); decorate(); setTab('notes');
    setTimeout(() => { const i = $('#pane').querySelector(`.note-item[data-i="${selNote}"] input`); if (i) i.focus(); }, 30);
  }
  if (c === 'comment') {
    const r = selRangeInEditor();
    const cobj = { id: U.uid('k'), text: '', quote: '', resolved: false, created: new Date().toISOString() };
    if (r && !r.collapsed) {
      cobj.quote = r.toString().slice(0, 300);
      const blk = n => (n.nodeType === 1 ? n : n.parentElement).closest('p,td,th,figcaption');
      if (blk(r.startContainer) && blk(r.startContainer) === blk(r.endContainer)) {
        const m = document.createElement('mark'); m.className = 'cm'; m.dataset.id = cobj.id;
        try { r.surroundContents(m); } catch { m.appendChild(r.extractContents()); r.insertNode(m); }
      }
    }
    (s.comments = s.comments || []).unshift(cobj); selComment = cobj.id; commit(); touch(); renderToc(); setTab('comments');
    setTimeout(() => { const t = $('#pane').querySelector(`.cm-item[data-id="${cobj.id}"] textarea`); if (t) t.focus(); }, 30);
  }
  if (c === 'snapshot') { commit(); const l = prompt('Nome desta versão (ex.: “antes de reescrever o 2º parágrafo”):', 'Versão marcada'); if (l === null) return; snapshot(s, l || 'Versão marcada'); U.toast('Versão guardada no histórico.'); }
  if (c === 'history') showHistory();
  if (c === 'diff') showDiffOriginal();
}
function goNext() { commit(); const n = nextToFix(); if (n) openSection(n.s.id); else U.toast('Todas as seções estão corrigidas!'); }

// ---------------- modal ----------------
function modal(title, html) { $('#modaltitle').textContent = title; $('#modalbody').innerHTML = html; $('#modal').classList.remove('hidden'); $('#modalbody').scrollTop = 0; }
function closeModal() { $('#modal').classList.add('hidden'); $('#modalbody').innerHTML = ''; }
$('#modalclose').onclick = closeModal;
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });

// ---------------- histórico e comparação ----------------
function showHistory() {
  commit(); const s = find(cur).s; const h = (H[s.id] || []).slice().reverse();
  let html = `<p class="muted">Versões guardadas automaticamente (ao sair da seção, a cada 10 minutos de edição, ao marcar como corrigida e antes de substituições) e as que você marcou. Ficam neste navegador e no arquivo de backup.</p>`;
  html += h.length ? `<table class="grid"><tr><th>Quando</th><th>Versão</th><th>Palavras</th><th></th></tr>` + h.map((v, i) => `<tr><td>${U.fmtDate(v.t)}</td><td>${v.label ? '<b>' + U.esc(v.label) + '</b>' : '<span class="muted">automática</span>'}</td><td>${U.countWords(U.plain(v.html))}</td><td style="white-space:nowrap">${v.html === s.html && v.title === s.title ? '<span class="badge">igual ao texto atual</span>' : `<button data-cmp="${i}">Comparar com o atual</button> <button data-res="${i}">Restaurar</button>`}</td></tr>`).join('') + `</table>` : '<p>Sem versões guardadas ainda.</p>';
  html += `<div id="diffout" style="margin-top:14px"></div>`;
  modal(`Histórico — ${secLabel(s)}`, html);
  $('#modalbody').querySelectorAll('[data-cmp]').forEach(b => b.onclick = () => { const v = h[+b.dataset.cmp]; $('#diffout').innerHTML = `<p class="muted"><del>Riscado</del>: só na versão de ${U.fmtDate(v.t)} · <ins>Destacado</ins>: só no texto atual. Notas aparecem entre ⁽ ⁾.</p><div class="diff">${U.diffHTML(U.plain(v.html, true), U.plain(s.html, true))}</div>`; $('#diffout').scrollIntoView({ behavior: 'smooth' }); });
  $('#modalbody').querySelectorAll('[data-res]').forEach(b => b.onclick = () => {
    const v = h[+b.dataset.res]; if (!confirm(`Restaurar a versão de ${U.fmtDate(v.t)}? O texto atual será guardado no histórico antes.`)) return;
    snapshot(s, 'Antes de restaurar versão anterior'); s.html = v.html; if (v.title && !s.intro) s.title = v.title; s.updated = Date.now(); pushUndo(s.id, s.html); touch(); closeModal(); openSection(s.id); U.toast('Versão restaurada.');
  });
}
async function loadOrig() { if (ORIG) return ORIG; try { const o = await (await fetch('data/original.json', { cache: 'no-cache' })).json(); ORIG = {}; o.parts.forEach(p => p.chapters.forEach(c => c.sections.forEach(s => ORIG[s.id] = s))); } catch { ORIG = {}; } return ORIG; }
async function showDiffOriginal() {
  commit(); const s = find(cur).s; const o = (await loadOrig())[s.id];
  if (!o) return modal('Comparar com o original', '<p>Esta seção não existia no texto importado.</p>');
  const same = o.html === s.html;
  modal(`Comparação com o texto importado — ${secLabel(s)}`, same ? '<p>Sem alterações em relação ao texto importado.</p>' : `<p class="muted"><del>Riscado</del>: removido · <ins>Destacado</ins>: acrescentado em relação ao texto que você enviou em 17/11/2026 (com notas, itálicos e quadro recuperados). Notas aparecem entre ⁽ ⁾.</p>${o.title !== s.title && !s.intro ? `<p><b>Título:</b> <del>${o.title}</del> → <ins>${s.title}</ins></p>` : ''}<div class="diff">${U.diffHTML(U.plain(o.html, true), U.plain(s.html, true))}</div>`);
}

// ---------------- buscar e substituir ----------------
let lastHits = [];
function showSearch() {
  commit();
  const terms = D.terms || [];
  modal('Buscar e substituir no livro', `
  <div class="formrow"><label>Buscar</label><input type="text" id="sQ" placeholder="texto a buscar"></div>
  <div class="formrow"><label>Substituir por</label><input type="text" id="sR" placeholder="(deixe vazio para só buscar)"></div>
  <div class="formrow"><label></label><label style="min-width:0"><input type="checkbox" id="sCase"> diferenciar maiúsculas</label><label style="min-width:0"><input type="checkbox" id="sWord"> palavra inteira</label><label style="min-width:0"><input type="checkbox" id="sNotes" checked> incluir notas</label><label style="min-width:0"><input type="checkbox" id="sRe"> expressão regular</label></div>
  <div class="formrow"><label></label><button class="primary" id="sGo">Buscar</button><button id="sRep" disabled>Substituir as marcadas</button><span id="sInfo" class="muted"></span></div>
  <div id="sHits"></div>
  <h4 style="margin-top:22px">Termos padronizados</h4>
  <p class="muted" style="font-size:12px">Lista de grafias a uniformizar no livro (forma a evitar → forma correta). “Verificar” conta as ocorrências; clique numa linha para buscar.</p>
  <table class="grid" id="tTab"></table>
  <div class="formrow" style="margin-top:8px"><input type="text" id="tA" placeholder="forma a evitar"><input type="text" id="tB" placeholder="forma correta"><button id="tAdd">Adicionar</button><button id="tChk">Verificar todos</button></div>`);
  const drawTerms = (counts = {}) => {
    $('#tTab').innerHTML = `<tr><th>Evitar</th><th>Usar</th><th>Ocorrências</th><th></th></tr>` + terms.map((t, i) => `<tr class="clk" data-i="${i}"><td>${U.esc(t[0])}</td><td>${U.esc(t[1])}</td><td>${counts[i] ?? '—'}</td><td><button data-del="${i}">✕</button></td></tr>`).join('');
    $('#tTab').querySelectorAll('tr.clk').forEach(tr => tr.onclick = e => {
      const i = +tr.dataset.i; if (e.target.dataset.del !== undefined) { terms.splice(i, 1); D.terms = terms; touch(); return drawTerms(); }
      $('#sQ').value = terms[i][0]; $('#sR').value = terms[i][1]; $('#sCase').checked = true; $('#sWord').checked = true; $('#sRe').checked = false; runSearch();
    });
  };
  drawTerms();
  $('#tAdd').onclick = () => { const a = $('#tA').value.trim(), b = $('#tB').value.trim(); if (!a) return; terms.push([a, b]); D.terms = terms; touch(); $('#tA').value = $('#tB').value = ''; drawTerms(); };
  $('#tChk').onclick = () => { const c = {}; terms.forEach((t, i) => { c[i] = searchAll(t[0], { cs: true, word: true, notes: true }).length; }); drawTerms(c); };
  $('#sGo').onclick = runSearch;
  $('#sQ').onkeydown = e => { if (e.key === 'Enter') runSearch(); };
  $('#sRep').onclick = doReplace;
  setTimeout(() => $('#sQ').focus(), 30);
}
function mkRe(q, o) {
  let src = o.re ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (o.word) src = `(?<![\\p{L}\\p{N}])(?:${src})(?![\\p{L}\\p{N}])`;
  return new RegExp(src, 'gu' + (o.cs ? '' : 'i'));
}
function textNodesOf(div) { const out = []; const w = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('.xref') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }); let n; while ((n = w.nextNode())) out.push(n); return out; }
function searchAll(q, o) {
  let re; try { re = mkRe(q, o); } catch (e) { U.toast('Expressão inválida: ' + e.message); return []; }
  const hits = [];
  for (const ob of order()) {
    const d = document.createElement('div'); d.innerHTML = ob.s.html;
    textNodesOf(d).forEach((n, ni) => { for (const m of n.nodeValue.matchAll(re)) if (m[0]) hits.push({ sec: ob.s.id, kind: 'text', ni, start: m.index, len: m[0].length, m: m[0], ctx: [n.nodeValue.slice(Math.max(0, m.index - 60), m.index), m[0], n.nodeValue.slice(m.index + m[0].length, m.index + m[0].length + 60)], ob }); });
    if (o.notes) d.querySelectorAll('.fn').forEach((f, ni) => { const v = f.dataset.note || ''; for (const m of v.matchAll(re)) if (m[0]) hits.push({ sec: ob.s.id, kind: 'note', ni, start: m.index, len: m[0].length, m: m[0], ctx: ['[nota] ' + v.slice(0, m.index), m[0], v.slice(m.index + m[0].length)], ob }); });
  }
  return hits;
}
function opts() { return { cs: $('#sCase').checked, word: $('#sWord').checked, notes: $('#sNotes').checked, re: $('#sRe').checked }; }
function runSearch() {
  const q = $('#sQ').value; if (!q) return;
  lastHits = searchAll(q, opts());
  $('#sInfo').textContent = `${lastHits.length} ocorrência(s)`;
  $('#sRep').disabled = !lastHits.length;
  $('#sHits').innerHTML = lastHits.slice(0, 500).map((h, i) => `<div class="hit-row"><input type="checkbox" data-i="${i}" ${h.ob.s.status === 'travado' ? 'disabled title="Seção travada"' : 'checked'}><div style="flex:1;cursor:pointer" data-go="${i}"><small>${h.ob.cn} · ${U.esc(secLabel(h.ob.s))}${h.ob.s.status === 'travado' ? ' · travada' : ''}</small>…${U.esc(h.ctx[0])}<mark class="hit">${U.esc(h.ctx[1])}</mark>${U.esc(h.ctx[2])}…</div></div>`).join('') + (lastHits.length > 500 ? '<p class="muted">Mostrando as 500 primeiras.</p>' : '');
  $('#sHits').querySelectorAll('[data-go]').forEach(el => el.onclick = () => { const h = lastHits[+el.dataset.go]; closeModal(); openSection(h.sec); setTimeout(() => reveal(h.m), 60); });
}
function doReplace() {
  const rep = $('#sR').value; const o = opts();
  const sel = [...$('#sHits').querySelectorAll('input[type=checkbox]:checked')].map(c => lastHits[+c.dataset.i]);
  if (!sel.length) return;
  if (!confirm(`Substituir ${sel.length} ocorrência(s) por “${rep}”? Cada seção alterada terá uma versão guardada antes.`)) return;
  commit();
  const bySec = {}; sel.forEach(h => (bySec[h.sec] = bySec[h.sec] || []).push(h));
  let n = 0;
  for (const [sid, hs] of Object.entries(bySec)) {
    const s = find(sid).s; snapshot(s, 'Antes de buscar e substituir');
    const d = document.createElement('div'); d.innerHTML = s.html;
    const tn = textNodesOf(d), fns = [...d.querySelectorAll('.fn')];
    hs.sort((a, b) => b.start - a.start).forEach(h => {
      const replacement = o.re ? h.m.replace(mkRe($('#sQ').value, o), rep) : rep;
      if (h.kind === 'text') { const nd = tn[h.ni]; nd.nodeValue = nd.nodeValue.slice(0, h.start) + replacement + nd.nodeValue.slice(h.start + h.len); }
      else { const f = fns[h.ni]; const v = f.dataset.note; f.dataset.note = v.slice(0, h.start) + replacement + v.slice(h.start + h.len); }
      n++;
    });
    s.html = U.cleanHTML(d); s.updated = Date.now(); pushUndo(s.id, s.html);
  }
  touch(); openSection(cur, { keepScroll: true }); U.toast(`${n} substituição(ões) feita(s).`); runSearch();
}

// ---------------- verificações gerais ----------------
function showChecks() {
  commit(); const names = Checks.surnames(D); let tA = 0, tS = 0;
  const rows = order().map(o => { const a = Checks.authorsInBody(o.s.html, names), st = Checks.style(o.s.html); tA += a.length; tS += st.length; return { o, a, st }; }).filter(r => r.a.length || r.st.length);
  const by = (st, t) => st.filter(x => x.type === t).length;
  modal('Verificações do livro', `<p>${tA} menção(ões) a autores no corpo do texto · ${tS} alerta(s) de estilo. Clique numa linha para abrir a seção (os detalhes ficam na aba <b>Verificação</b> do painel).</p>
  <table class="grid"><tr><th>Seção</th><th>Autores</th><th>Parág. curtos</th><th>Longos</th><th>Frases longas</th><th>Repetições</th><th>Listas</th></tr>${rows.map(r => `<tr class="clk" data-sec="${r.o.s.id}"><td><span class="dot ${r.o.s.status}" style="display:inline-block"></span> ${r.o.cn} · ${U.esc(secLabel(r.o.s))}</td><td>${r.a.length ? `<span class="badge warn">${r.a.length}</span> <small>${U.esc([...new Set(r.a.map(x => x.name))].join(', '))}</small>` : ''}</td><td>${by(r.st, 'curto') || ''}</td><td>${by(r.st, 'longo') || ''}</td><td>${by(r.st, 'frase') || ''}</td><td>${by(r.st, 'repeticao') || ''}</td><td>${by(r.st, 'lista') || ''}</td></tr>`).join('')}</table>
  <h4>Nomes ignorados</h4><p class="muted">${(D.ignoreNames || []).map(n => `${U.esc(n)} <a href="#" data-un="${U.esc(n)}">(voltar a verificar)</a>`).join(' · ') || 'nenhum'}</p>`);
  $('#modalbody').querySelectorAll('tr.clk').forEach(tr => tr.onclick = () => { closeModal(); openSection(tr.dataset.sec); setTab('checks'); });
  $('#modalbody').querySelectorAll('[data-un]').forEach(a => a.onclick = e => { e.preventDefault(); D.ignoreNames = D.ignoreNames.filter(n => n !== a.dataset.un); touch(); showChecks(); });
}

// ---------------- normas citadas ----------------
function showNorms(filter = 'todas') {
  commit(); const list = Checks.norms(D, order().map(o => o.s)); const chk = D.normsChecked = D.normsChecked || {};
  const shown = list.filter(n => filter === 'todas' || (filter === 'pendentes' ? !chk[n.key] : chk[n.key]));
  const done = list.filter(n => chk[n.key]).length;
  modal('Normas, decisões e casos citados', `<p>${list.length} itens encontrados no texto e nas notas · ${done} conferidos. Marque cada um depois de conferir número, data e conteúdo na fonte oficial.</p>
  <div class="formrow"><label style="min-width:0">Mostrar:</label><select id="nF"><option value="todas">todos</option><option value="pendentes">só não conferidos</option><option value="ok">só conferidos</option></select></div>
  <table class="grid"><tr><th style="width:30px">✓</th><th>Norma / decisão / caso</th><th>Onde aparece</th></tr>${shown.map(n => `<tr><td><input type="checkbox" data-k="${U.esc(n.key)}" ${chk[n.key] ? 'checked' : ''}></td><td>${U.esc(n.key)}</td><td>${[...new Map(n.occ.map(o => [o.sec, o])).values()].map(o => { const ob = find(o.sec); return `<a href="#" data-sec="${o.sec}" data-term="${U.esc(n.key)}" title="${U.esc(o.ctx)}">${ob.cn}${ob.sn ? '.' + ob.sn : ''}</a>`; }).join(', ')}</td></tr>`).join('')}</table>`);
  $('#nF').value = filter; $('#nF').onchange = e => showNorms(e.target.value);
  $('#modalbody').querySelectorAll('[data-k]').forEach(c => c.onchange = () => { if (c.checked) chk[c.dataset.k] = new Date().toISOString(); else delete chk[c.dataset.k]; touch(); });
  $('#modalbody').querySelectorAll('[data-sec]').forEach(a => a.onclick = e => { e.preventDefault(); closeModal(); openSection(a.dataset.sec); setTimeout(() => reveal(a.dataset.term), 60); });
}

// ---------------- referências ----------------
function citationIndex(sections) {
  const idx = new Map();
  sections.forEach(s => { const d = document.createElement('div'); d.innerHTML = s.html; d.querySelectorAll('.fn').forEach(f => U.citations(f.dataset.note || '').forEach(c => { if (!idx.has(c.key)) idx.set(c.key, { label: c.label, secs: [] }); idx.get(c.key).secs.push(s.id); })); });
  return idx;
}
const sortRefs = list => list.sort((a, b) => U.plain(a.html).localeCompare(U.plain(b.html), 'pt', { sensitivity: 'base' }));
function showRefs(group = 'doutrina') {
  commit();
  const idx = citationIndex(order().map(o => o.s)); const keys = refKeySet();
  const missing = [...idx.entries()].filter(([k]) => !keys.has(k));
  const L = D.refs[group]; sortRefs(L);
  const uncited = L.filter(r => !idx.has(U.refKey(r.html))).length;
  let h = `<div class="formrow"><button class="${group === 'doutrina' ? 'primary' : ''}" data-g="doutrina">Doutrina (${D.refs.doutrina.length})</button><button class="${group === 'jurisprudencia' ? 'primary' : ''}" data-g="jurisprudencia">Jurisprudência e documentos (${D.refs.jurisprudencia.length})</button><span class="spacer" style="flex:1"></span><button id="rAdd">+ Nova referência</button></div>`;
  h += `<p class="muted" style="font-size:12px">A lista se ordena sozinha. Cada entrada é ligada às notas pela chave <b>SOBRENOME, ano</b> (ex.: TURI, 1990). Ao exportar, por padrão saem só as obras citadas. Edite direto no texto (Ctrl+I para itálico).</p>`;
  if (missing.length) h += `<div class="issue"><b>${missing.length} citação(ões) nas notas sem entrada na lista</b>${missing.map(([k, v]) => `<div style="margin-top:4px">${U.esc(v.label)} <small class="muted">(${v.secs.length} nota(s))</small> <a href="#" data-mk="${U.esc(k)}" data-lbl="${U.esc(v.label)}">criar entrada</a> · <a href="#" data-gosec="${v.secs[0]}" data-term="${U.esc(v.label.split(',')[0])}">ver nota</a></div>`).join('')}</div>`;
  if (uncited) h += `<p class="muted">${uncited} entrada(s) desta lista não são citadas em nenhuma nota (marcadas abaixo).</p>`;
  h += L.map((r, i) => { const k = U.refKey(r.html); const c = idx.get(k); return `<div class="refrow" data-i="${i}"><div class="txt" contenteditable="true">${r.html}</div>${c ? `<span class="badge ok" title="${U.esc(k)}">citada ${c.secs.length}×</span>` : `<span class="badge warn" title="Chave: ${U.esc(k)}">não citada</span>`}<button data-del title="Excluir">✕</button></div>`; }).join('');
  modal('Referências', h);
  const body = $('#modalbody');
  body.querySelectorAll('[data-g]').forEach(b => b.onclick = () => showRefs(b.dataset.g));
  body.querySelectorAll('.refrow').forEach(row => {
    const r = L[+row.dataset.i]; const t = row.querySelector('.txt');
    t.onblur = () => { const nh = U.cleanHTML(t).replace(/^<p>|<\/p>$/g, ''); if (nh !== r.html) { r.html = nh; touch(); } };
    t.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); document.execCommand('italic'); } if (e.key === 'Enter') { e.preventDefault(); t.blur(); } };
    row.querySelector('[data-del]').onclick = () => { if (!confirm('Excluir esta referência?')) return; L.splice(L.indexOf(r), 1); touch(); showRefs(group); };
  });
  $('#rAdd').onclick = () => { L.unshift({ id: U.uid('r'), html: 'SOBRENOME, Nome. <i>Título da obra</i>. Cidade: Editora, ano.' }); touch(); showRefs(group); setTimeout(() => body.querySelector('.refrow .txt').focus(), 30); };
  body.querySelectorAll('[data-mk]').forEach(a => a.onclick = e => { e.preventDefault(); const [au, y] = a.dataset.lbl.split(', '); D.refs.doutrina.push({ id: U.uid('r'), html: `${U.esc(au.toUpperCase())}, Nome. <i>Título da obra</i>. Cidade: Editora, ${U.esc(y)}.` }); touch(); showRefs('doutrina'); U.toast('Entrada criada: complete os dados.'); });
  body.querySelectorAll('[data-gosec]').forEach(a => a.onclick = e => { e.preventDefault(); closeModal(); openSection(a.dataset.gosec); setTab('notes'); });
}

// ---------------- pendências (todos os comentários) ----------------
function showTodo(showResolved = false, q = '') {
  commit();
  const all = order().flatMap(o => (o.s.comments || []).map(c => ({ o, c }))).filter(x => (showResolved || !x.c.resolved) && (!q || (x.c.text + x.c.quote).toLowerCase().includes(q.toLowerCase())));
  modal('Pendências e comentários', `<div class="formrow"><input type="text" id="tdQ" placeholder="filtrar…" value="${U.esc(q)}"><label style="min-width:0"><input type="checkbox" id="tdR" ${showResolved ? 'checked' : ''}> mostrar resolvidos</label></div>
  ${all.length ? `<table class="grid"><tr><th>Seção</th><th>Comentário</th><th></th></tr>${all.map(x => `<tr class="clk" data-sec="${x.o.s.id}" data-id="${x.c.id}"><td style="white-space:nowrap">${x.o.cn}${x.o.sn ? '.' + x.o.sn : ''}<br><small class="muted">${U.esc(secLabel(x.o.s)).slice(0, 40)}</small></td><td>${x.c.quote ? `<small class="muted">“${U.esc(x.c.quote.slice(0, 120))}”</small><br>` : ''}${U.esc(x.c.text) || '<i class="muted">(sem texto)</i>'}</td><td>${x.c.resolved ? '<span class="badge ok">resolvido</span>' : ''}</td></tr>`).join('')}</table>` : '<p class="muted">Nenhuma pendência aberta.</p>'}`);
  $('#tdQ').oninput = U.debounce(e => showTodo($('#tdR').checked, $('#tdQ').value), 300);
  $('#tdR').onchange = () => showTodo($('#tdR').checked, $('#tdQ').value);
  $('#modalbody').querySelectorAll('tr.clk').forEach(tr => tr.onclick = () => { closeModal(); openSection(tr.dataset.sec); selComment = tr.dataset.id; decorate(); setTab('comments'); });
}

// ---------------- exportação ----------------
function exportModel(scope, refsMode) {
  commit();
  const nums = chapterNums(); const ord = order();
  const pick = s => scope === 'tudo' || (scope === 'corrigidas' && DONE(s)) || (scope === 'capitulo' && find(cur).c.sections.includes(s));
  const parts = D.parts.map(p => ({
    id: p.id, num: nums[p.id], label: p.kind === 'apendices' ? '' : labels().part[p.id], title: p.title, titleText: U.plain(p.title),
    chapters: p.chapters.map(c => {
      let n = 0;
      const sections = c.sections.map(s => { if (!s.intro) n++; return { s, num: n }; }).filter(x => pick(x.s)).map(x => {
        const d = document.createElement('div'); d.innerHTML = x.s.html;
        d.querySelectorAll('.xref').forEach(e => { const t = e.dataset.target; e.replaceWith(nums[t] === undefined ? e.textContent : (/^p/.test(t) ? `Parte ${nums[t]}` : `Capítulo ${nums[t]}`)); });
        d.querySelectorAll('mark.cm').forEach(m => m.replaceWith(...m.childNodes));
        return { id: x.s.id, title: x.s.intro ? null : x.s.title, num: x.num, html: d.innerHTML };
      });
      return { id: c.id, num: nums[c.id], label: labels().ch[c.id], title: c.title, titleText: U.plain(c.title), sections };
    }).filter(c => c.sections.length),
  })).filter(p => p.chapters.length);
  const idx = citationIndex(parts.flatMap(p => p.chapters.flatMap(c => c.sections)));
  const refs = {};
  ['doutrina', 'jurisprudencia'].forEach(g => { refs[g] = sortRefs(D.refs[g].slice()).filter(r => refsMode === 'todas' || idx.has(U.refKey(r.html))).map(r => r.html); });
  const st = stats(ord.map(o => o.s));
  const now = new Date();
  return {
    meta: D.meta, parts, refs,
    date: now.toLocaleString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    stats: `${st.ndone} de ${st.n} seções corrigidas (${st.pct.toFixed(0)}% das palavras).`,
    scopeNote: scope === 'tudo' ? 'Texto integral.' : scope === 'corrigidas' ? 'Contém apenas as seções já corrigidas.' : 'Contém apenas o capítulo selecionado.',
    fileTag: now.toISOString().slice(0, 16).replace('T', ' ').replace(':', 'h'),
  };
}
function showExport() {
  const m = D.meta;
  modal('Exportar', `<div class="formrow"><label>Conteúdo</label><select id="xS"><option value="tudo">Livro inteiro</option><option value="corrigidas">Só as seções corrigidas</option><option value="capitulo">Só o capítulo atual</option></select></div>
  <div class="formrow"><label>Referências</label><select id="xR"><option value="citadas">Só as obras citadas nas notas</option><option value="todas">Todas as da lista</option></select></div>
  <h4>Folha de rosto</h4>
  <div class="formrow"><label>Título</label><input type="text" id="mT" value="${U.esc(m.title)}"></div>
  <div class="formrow"><label>Subtítulo / volume</label><input type="text" id="mS" value="${U.esc(m.subtitle)}"></div>
  <div class="formrow"><label>Autor</label><input type="text" id="mA" value="${U.esc(m.author)}"></div>
  <div class="formrow"><label>Local e ano</label><input type="text" id="mP" value="${U.esc(m.place)}" style="max-width:200px"><input type="text" id="mY" value="${U.esc(m.year)}" style="max-width:90px"></div>
  <div class="formrow"><label>Indicação</label><input type="text" id="mE" value="${U.esc(m.edition || '')}"></div>
  <div class="formrow" style="margin-top:16px"><label></label><button class="primary" id="xPdf">PDF (livro diagramado)</button><button class="primary" id="xDoc">Word (.docx)</button></div>
  <p class="muted" style="font-size:12px">PDF: abre uma janela com o livro paginado (16 × 23 cm, notas de rodapé, sumário com páginas). Clique em “Salvar como PDF”. Word: baixa o arquivo; ao abrir, aceite atualizar os campos para montar o sumário. A data e o estado da revisão vão na página de créditos.</p>`);
  const saveMeta = () => { Object.assign(D.meta, { title: $('#mT').value, subtitle: $('#mS').value, author: $('#mA').value, place: $('#mP').value, year: $('#mY').value, edition: $('#mE').value }); touch(); };
  $('#xPdf').onclick = () => { saveMeta(); Exporta.pdf(exportModel($('#xS').value, $('#xR').value)); };
  $('#xDoc').onclick = async () => { saveMeta(); $('#xDoc').disabled = true; $('#xDoc').textContent = 'Gerando…'; try { await Exporta.docx(exportModel($('#xS').value, $('#xR').value)); } catch (e) { U.toast('Erro: ' + e.message, 5000); console.error(e); } $('#xDoc').disabled = false; $('#xDoc').textContent = 'Word (.docx)'; };
}

// ---------------- backup ----------------
function download(name, text, type = 'application/json') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
function showBackup() {
  commit();
  const last = localStorage.getItem('cdl-lastbackup');
  modal('Backup', `<p>Tudo é salvo automaticamente neste navegador a cada alteração. O backup é um arquivo único com o livro, as referências, os comentários e o histórico de versões. Guarde-o fora do computador e use-o para levar a revisão a outro aparelho, se não usar a sincronização com o GitHub.</p>
  <p class="muted">Último backup baixado: ${last ? U.fmtDate(last) : 'nunca'}.</p>
  <div class="formrow"><button class="primary" id="bDown">Baixar backup completo</button><label class="muted" style="min-width:0">ou</label><label style="min-width:0"><button id="bUpBtn">Restaurar de um arquivo…</button><input type="file" id="bUp" accept=".json,application/json" class="hidden"></label></div>
  <h4>Outros</h4><div class="formrow"><button id="bMd">Baixar o texto em Markdown</button></div>
  ${(D.trash || []).length ? `<h4>Lixeira</h4><p class="muted">${D.trash.length} item(ns) excluído(s). <a href="#" id="bTrash">Restaurar o último</a></p>` : ''}`);
  $('#bDown').onclick = () => { const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-'); download(`backup-curso-direito-linguistico-${stamp}.json`, JSON.stringify({ kind: 'cdl-backup', v: 1, data: D, history: H }, null, 1)); localStorage.setItem('cdl-lastbackup', new Date().toISOString()); U.toast('Backup baixado.'); };
  $('#bUpBtn').onclick = () => $('#bUp').click();
  $('#bUp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text()); const nd = j.kind === 'cdl-backup' ? j.data : j;
      if (!nd.parts) throw new Error('arquivo não reconhecido');
      if (!confirm(`Substituir o livro atual pelo backup de ${U.fmtDate(nd.updated)}? Recomenda-se baixar um backup do estado atual antes.`)) return;
      D = nd; if (j.history) H = j.history; await DB.set('data', D); await DB.set('history', H); UNDO = {}; await DB.set('undo', UNDO);
      closeModal(); boot2(); U.toast('Backup restaurado.');
    } catch (err) { U.toast('Não foi possível ler o arquivo: ' + err.message, 5000); }
  };
  $('#bMd').onclick = () => {
    const nums = chapterNums(); let md = `# ${D.meta.title}\n\n`; let fnn = 0;
    D.parts.forEach(p => { const L = labels(); md += `# ${L.part[p.id]} — ${U.plain(p.title)}\n\n`; p.chapters.forEach(c => { md += `## ${L.ch[c.id]}. ${U.plain(c.title)}\n\n`; let n = 0; c.sections.forEach(s => { if (!s.intro) md += `### ${++n}. ${U.plain(s.title).trim()}\n\n`; const d = document.createElement('div'); d.innerHTML = s.html; d.querySelectorAll('i').forEach(i => i.replaceWith('*' + i.textContent + '*')); d.querySelectorAll('.fn').forEach(f => f.replaceWith(`^[${f.dataset.note}]`)); d.querySelectorAll('.xref').forEach(x => { const t = x.dataset.target; x.replaceWith(/^p/.test(t) ? `Parte ${nums[t]}` : `Capítulo ${nums[t]}`); }); d.querySelectorAll('p').forEach(p => p.append('\n\n')); md += d.textContent.trim() + '\n\n'; }); }); });
    download('curso-direito-linguistico.md', md, 'text/markdown');
  };
  const bt = $('#bTrash'); if (bt) bt.onclick = e => { e.preventDefault(); const it = D.trash.pop(); if (it.chapter) D.parts[D.parts.length - 1].chapters.push(it.chapter); else { const c = allChapters().find(c => c.id === it.chapter) || allChapters()[0]; c.sections.push(it.section); } touch(); closeModal(); renderToc(); renderProgress(); U.toast('Restaurado no fim do capítulo (ou da última parte).'); };
}

// ---------------- GitHub ----------------
function showSync() {
  const c = Sync.cfg() || Sync.defaults(); const last = localStorage.getItem('cdl-lastsync');
  modal('Sincronização com o GitHub', `<p>Com a sincronização ligada, o livro é gravado no seu repositório (arquivo <code>${U.esc(c.path)}</code>) cerca de 45 segundos depois de cada alteração. Ao abrir a página em outro aparelho, o sistema oferece carregar a versão mais recente. O histórico de versões fica em cada aparelho e no backup.</p>
  <details><summary><b>Como criar o token (uma vez só)</b></summary><ol style="line-height:1.6"><li>Abra <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>.</li><li>Nome: “Revisão do livro”. Validade: a que preferir.</li><li>Em <i>Repository access</i>, escolha <i>Only select repositories</i> e marque <b>${U.esc(c.repo)}</b>.</li><li>Em <i>Permissions › Repository permissions</i>, ponha <b>Contents</b> em <b>Read and write</b>.</li><li>Gere o token, copie e cole abaixo. Ele fica guardado só neste navegador.</li></ol></details>
  <div class="formrow" style="margin-top:12px"><label>Dono</label><input type="text" id="gO" value="${U.esc(c.owner)}"></div>
  <div class="formrow"><label>Repositório</label><input type="text" id="gR" value="${U.esc(c.repo)}"></div>
  <div class="formrow"><label>Ramo</label><input type="text" id="gB" value="${U.esc(c.branch)}"></div>
  <div class="formrow"><label>Arquivo</label><input type="text" id="gP" value="${U.esc(c.path)}"></div>
  <div class="formrow"><label>Token</label><input type="password" id="gT" value="${U.esc(c.token)}" placeholder="github_pat_…"></div>
  <div class="formrow"><label></label><label style="min-width:0"><input type="checkbox" id="gA" ${c.auto ? 'checked' : ''}> sincronizar automaticamente</label></div>
  <div class="formrow"><label></label><button class="primary" id="gSave">Salvar e testar</button><button id="gPush">Enviar agora</button><button id="gPull">Carregar do GitHub</button></div>
  <p class="muted">Última sincronização: ${last ? U.fmtDate(last) : 'nunca'}.</p><p id="gMsg"></p>`);
  const read = () => ({ owner: $('#gO').value.trim(), repo: $('#gR').value.trim(), branch: $('#gB').value.trim() || 'main', path: $('#gP').value.trim() || 'data/livro.json', token: $('#gT').value.trim(), auto: $('#gA').checked });
  const msg = (t, err) => { $('#gMsg').textContent = t; $('#gMsg').style.color = err ? 'var(--warn)' : 'var(--ok)'; };
  $('#gSave').onclick = async () => { Sync.setCfg(read()); try { const m = await Sync.remoteMeta(); msg(m ? 'Conexão funcionando. Arquivo encontrado no repositório.' : 'Conexão funcionando. O arquivo ainda não existe: será criado no primeiro envio.'); } catch (e) { msg(e.message, true); } };
  $('#gPush').onclick = async () => { Sync.setCfg(read()); commit(); try { await Sync.push(D, 'Revisão do livro (envio manual)'); localStorage.setItem('cdl-lastsync', new Date().toISOString()); msg('Enviado.'); } catch (e) { msg(e.message, true); } };
  $('#gPull').onclick = async () => { Sync.setCfg(read()); try { const r = await Sync.pull(); if (!r) return msg('Arquivo não encontrado no repositório.', true); if (!confirm(`Substituir o livro deste navegador pela versão do GitHub (${U.fmtDate(r.updated)})?`)) return; snapshotAll('Antes de carregar do GitHub'); D = r; await DB.set('data', D); closeModal(); boot2(); U.toast('Versão do GitHub carregada.'); } catch (e) { msg(e.message, true); } };
}
function snapshotAll(label) { order().forEach(o => snapshot(o.s, label)); }

// ---------------- barra superior ----------------
$('#btnNext').onclick = goNext;
$('#btnProgress').onclick = showProgress;
$('#btnSearch').onclick = showSearch;
$('#btnChecks').onclick = showChecks;
$('#btnNorms').onclick = () => showNorms();
$('#btnRefs').onclick = () => showRefs();
$('#btnTodo').onclick = () => showTodo();
$('#btnExport').onclick = showExport;
$('#btnBackup').onclick = showBackup;
$('#btnSync').onclick = showSync;
$('#btnSide').onclick = () => document.body.classList.toggle(window.innerWidth < 760 ? 'showside' : 'noside');
$('#btnPanel').onclick = () => document.body.classList.toggle(window.innerWidth < 1100 ? 'showpanel' : 'nopanel');
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && D) { commit(); persist.flush(); } });
window.addEventListener('beforeunload', e => { if (commitTimer || dirty) { commit(); persist.flush(); } });

// ---------------- início ----------------
function boot2() {
  WC.clear();
  renderProgress(); renderToc();
  const saved = localStorage.getItem('cdl-cur');
  const first = order().find(o => !DONE(o.s)) || order()[0];
  cur = null; openSection(saved && find(saved) ? saved : first.s.id);
  setSave('Salvo');
  const lb = localStorage.getItem('cdl-lastbackup');
  if (!Sync.ok() && (!lb || Date.now() - new Date(lb) > 7 * 864e5)) setTimeout(() => U.toast('Lembrete: baixe um backup (botão Backup) ou ligue a sincronização com o GitHub.', 5000), 1500);
}
// Acrescenta ao livro salvo no navegador as partes novas publicadas no repositório (sem tocar nas existentes)
function mergeSeed(R) {
  const known = new Set(D.seedParts || D.parts.map(p => p.id)); const have = new Set(D.parts.map(p => p.id)); const added = [];
  R.parts.forEach(p => { if (!have.has(p.id) && !known.has(p.id)) { D.parts.push(p); added.push(p); } });
  if (added.length) ['doutrina', 'jurisprudencia'].forEach(g => { const ks = new Set(D.refs[g].map(r => U.refKey(r.html))); (R.refs[g] || []).forEach(r => { const k = U.refKey(r.html); if (!ks.has(k)) { D.refs[g].push(r); ks.add(k); } }); });
  D.seedParts = [...new Set([...known, ...R.parts.map(p => p.id)])];
  return added;
}
async function boot() {
  try {
    D = await DB.get('data');
    if (!D) { D = await (await fetch('data/livro.json', { cache: 'no-store' })).json(); await DB.set('data', D); }
    else {
      try {
        const added = mergeSeed(await (await fetch('data/livro.json', { cache: 'no-store' })).json());
        if (added.length) { await DB.set('data', D); setTimeout(() => U.toast(`Conteúdo novo acrescentado ao livro: ${added.map(p => U.plain(p.title)).join('; ')}.`, 6000), 800); }
      } catch (e) { console.warn('Não foi possível verificar conteúdo novo:', e); }
    }
    H = (await DB.get('history')) || {}; UNDO = (await DB.get('undo')) || {};
    boot2();
    if (Sync.ok()) {
      try { const r = await Sync.pull(); if (r && r.updated && new Date(r.updated) > new Date(D.updated) && confirm(`Há uma versão mais recente no GitHub (${U.fmtDate(r.updated)}), provavelmente salva em outro aparelho. Carregar?`)) { snapshotAll('Antes de carregar do GitHub'); D = r; await DB.set('data', D); boot2(); } }
      catch (e) { setSave('Salvo localmente · GitHub: ' + e.message, 'err'); }
    }
  } catch (e) { setSave('Erro ao carregar: ' + e.message, 'err'); console.error(e); }
}
boot();
