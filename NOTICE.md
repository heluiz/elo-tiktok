# Créditos e proveniência — elo TikTok

O elo TikTok 0.2.1 é um projeto separado, criado a partir da referência fornecida pelo usuário em `elo-instagram-v0.1.1.zip` (elo Instagram 0.1.1).

A referência declara derivação do [IgDiff](https://github.com/mzhao1599/igdiff), revisão:

```text
2f5e3480fb7b8bf0418ecda98336b7dc0b0bbc2e
```

Foram reaproveitados ou adaptados:

- `lib/tracker/diff.ts`: operações puras de conjuntos, cálculo de relações e diferenças entre análises, agora em `lib/diff.ts`.
- `lib/panel/view.ts`: funções de CSV e proteção contra fórmulas de planilhas, adaptadas em `lib/export.ts`.
- Ícones de 16, 32, 48 e 128 pixels do elo Instagram.
- Configuração de WXT/Preact e inclusão da licença no compilado.
- Licença MIT e avisos das dependências distribuídas.

Os avisos de copyright fornecidos foram preservados integralmente em `LICENSE`: David Arroyo (2023), Edvin (2025–2026) e IgDiff contributors (2026). A referência reconhece o trabalho de David Arroyo e Edvin em InstagramUnfollowers.

A importação oficial TikTok, o modelo de dados e armazenamento próprio, a interface deste gerenciador e a integração conservadora com o DOM TikTok foram desenvolvidos para este projeto. A versão 0.2.0 acrescenta leitura com rolagem da lista Seguindo, conferência de quantidade e fila de ações que abre os perfis individualmente após a revisão. A implementação não transporta endpoints ou operações Instagram para o TikTok.

A versão 0.2.1 acrescenta identificação de perfil por título/subtítulo sem depender da tag HTML e recuperação limitada de uma consulta de estado quando uma aba existente está sem o receptor da extensão. O leitor continua empacotado, executado em contexto isolado, sem código remoto e sem reenvio automático de ações. O uso do ciclo de vida WXT foi ajustado para retirar o receptor e cancelar operações quando o contexto anterior é invalidado. As fontes de interoperabilidade e documentações oficiais correspondentes estão em `docs/PESQUISA.md`.

Os projetos externos examinados em `docs/PESQUISA.md` serviram como evidências de formatos, viabilidade e limitações. Não foi incorporado código de TikTok-Api, Kotmir/tiktok-auto-unfollow, SouthVirginia19/tiktok-unfollow-non-mutuals, pond, OpenBiliClaw, GLVictoria/tiktok-unfollow, NotFollow, zollo/tiktok-downloader ou HUDI. Em particular, nenhum código AGPL/GPL desses projetos foi incorporado. Seletores de marcação, comportamento de abertura/rolagem e nomes de campos observados foram tratados como informações de interoperabilidade.

Preact, idb, o runtime WXT e o polyfill de carregamento do Vite integram a distribuição; seus avisos estão em `THIRD-PARTY-NOTICES.txt` e `licenses/` no compilado, ou em `public/` no código-fonte. Dependências de desenvolvimento e versões estão em `package-lock.json`.

O elo TikTok não é afiliado, endossado ou fornecido por TikTok/ByteDance. Nomes de terceiros identificam os serviços com os quais o usuário escolhe interagir.
