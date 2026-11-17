# Curso de Direito Linguístico — sistema de revisão

Página web para revisar o livro *Curso de Direito Linguístico*, de José Querino de Macêdo Neto.

**Abrir:** https://querinoneto.github.io/curso-direito-linguistico/

## O que contém

- `index.html`, `css/`, `js/`: o sistema.
- `data/livro.json`: o livro (texto, notas, referências, estados das seções e comentários). Este é o arquivo atualizado pela sincronização.
- `data/original.json`: o texto importado em 17/11/2026, usado no botão “Comparar com original”. Não é alterado.
- `fonts/`: TeX Gyre Pagella (licença GUST), a fonte do livro.
- `lib/`: Paged.js (MIT), para o PDF, e docx (MIT), para o Word.

## Onde ficam os dados

Cada alteração é salva na hora no navegador (IndexedDB). Para não depender de um único aparelho:

1. **Sincronização com o GitHub** (botão *GitHub*): grava `data/livro.json` neste repositório. Requer um token de acesso pessoal com permissão *Contents: Read and write* apenas para este repositório.
2. **Backup** (botão *Backup*): baixa um arquivo único com o livro e o histórico de versões.
