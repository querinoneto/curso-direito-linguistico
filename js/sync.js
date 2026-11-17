// Sincronização com o GitHub (API de conteúdo). O token fica só neste navegador.
const Sync = {};
Sync.cfg = () => { try { return JSON.parse(localStorage.getItem('cdl-sync') || 'null'); } catch { return null; } };
Sync.setCfg = c => localStorage.setItem('cdl-sync', JSON.stringify(c));
Sync.ok = () => { const c = Sync.cfg(); return !!(c && c.token && c.owner && c.repo); };

Sync.defaults = () => {
  // em github.io, deduz dono e repositório pelo endereço
  const h = location.hostname, p = location.pathname.split('/').filter(Boolean);
  const owner = h.endsWith('.github.io') ? h.split('.')[0] : 'querinoneto';
  const repo = h.endsWith('.github.io') && p[0] ? p[0] : 'curso-direito-linguistico';
  return { owner, repo, branch: 'main', path: 'data/livro.json', auto: true, token: '' };
};

function b64encode(str) {
  const bytes = new TextEncoder().encode(str); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function gh(path, opt = {}) {
  const c = Sync.cfg();
  const r = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/${path}`, {
    ...opt, headers: { Authorization: `Bearer ${c.token}`, Accept: opt.accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opt.headers || {}) }
  });
  if (!r.ok && r.status !== 404) { let m = ''; try { m = (await r.json()).message; } catch { } throw new Error(`GitHub ${r.status}: ${m}`); }
  return r;
}
Sync.remoteMeta = async () => {
  const c = Sync.cfg();
  const r = await gh(`contents/${c.path}?ref=${encodeURIComponent(c.branch)}`);
  if (r.status === 404) return null;
  return r.json();
};
Sync.pull = async () => {
  const c = Sync.cfg();
  const r = await gh(`contents/${c.path}?ref=${encodeURIComponent(c.branch)}`, { accept: 'application/vnd.github.raw+json' });
  if (r.status === 404) return null;
  return JSON.parse(await r.text());
};
Sync.push = async (data, msg) => {
  const c = Sync.cfg();
  const meta = await Sync.remoteMeta();
  const body = { message: msg || `Revisão do livro — ${new Date().toLocaleString('pt-BR')}`, content: b64encode(JSON.stringify(data, null, 1)), branch: c.branch };
  if (meta && meta.sha) body.sha = meta.sha;
  const r = await gh(`contents/${c.path}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  if (r.status === 404) throw new Error('Repositório ou ramo não encontrado. Confira o nome e as permissões do token.');
  return r.json();
};
