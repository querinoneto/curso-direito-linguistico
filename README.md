# Curso de Direito Linguístico — sistema de revisão

Página web para revisar o livro *Curso de Direito Linguístico*, de José Querino de Macêdo Neto.

**Abrir:** https://querinoneto.github.io/curso-direito-linguistico/

## O que contém

- `index.html`, `css/`, `js/`: o sistema.
- `data/livro.json`: o livro (texto, notas, referências, estados das seções e comentários). Este é o arquivo atualizado pela sincronização.
- `data/original.json`: o texto importado em 17/11/2026, usado no botão “Comparar com original”. Não é alterado.
- `fonts/`: TeX Gyre Pagella (licença GUST), a fonte do livro.
- `lib/`: Paged.js (MIT), para o PDF, e docx (MIT), para o Word.

## Conferência de fontes

O botão **Conferir fontes** lista cada citação das notas com a afirmação que ela sustenta no texto e a referência completa, com links para abrir ou buscar a fonte (Google Livros, Google Acadêmico, Internet Archive e o repositório oficial de cada tribunal ou organismo). Cada citação pode ser marcada como *confere*, *confere em parte* ou *não confere*, com observação. Os registros ficam em `verif`, dentro de `data/livro.json`, sem alterar o texto. Se a afirmação for reescrita, a citação volta a “a conferir”. O endereço de cada fonte pode ser guardado na própria referência (“+ link da fonte”).

## Onde ficam os dados

Cada alteração é salva na hora no navegador (IndexedDB). Para não depender de um único aparelho:

1. **Sincronização com o GitHub** (botão *GitHub*): grava `data/livro.json` neste repositório. Requer um token de acesso pessoal com permissão *Contents: Read and write* apenas para este repositório.
2. **Backup** (botão *Backup*): baixa um arquivo único com o livro e o histórico de versões.

## Fontes do texto

As Partes III a XII e os Apêndices foram redigidos em `fontes/*.md` (com as referências novas em `fontes/refs-novas.md`) e inseridos em `data/livro.json` por `ferramentas/gera_acrescimos.py`, que nunca altera as Partes I e II. Ao abrir o sistema num navegador que já tinha o livro salvo, as partes novas são acrescentadas automaticamente, sem mexer no que foi revisado.
