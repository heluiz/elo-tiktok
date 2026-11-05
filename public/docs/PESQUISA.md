# Pesquisa técnica — elo TikTok 0.2.1

Consulta em 26/10/2026. Pesquisa somente de leitura; nenhuma conta, cookie, login ou ação real foi utilizado. Fontes oficiais e arquivos de repositórios primários consultados pela web e pelo MCP GitHub. Os formatos de arquivo são evidências de interoperabilidade, não instruções para a extensão executar.

## Conclusão para a versão 0.2.1

A extensão usa a sessão TikTok já aberta para ler Seguindo pelo DOM, sem exportar cookies ou exigir um arquivo. Fontes primárias MIT documentam o contador que abre a lista, o contêiner rolável e os controles de unfollow. Na implementação 0.2.0, a quantidade de Seguindo só é conferida quando @usuários únicos correspondem a um contador exato estável; isso é evidência separada e não comprova completude de seguidores ou perdas. Depois de revisão nominal, uma fila pode visitar os perfis para tentar deixar de seguir.

A importação local dos arquivos oficiais permanece como alternativa para analisar ambas as listas, calcular relações e comparar histórico. Os seletores do site não são um contrato oficial e ainda precisam de validação no TikTok real. Remover seguidores só foi confirmado nas instruções oficiais do aplicativo; não há método web verificável nesta pesquisa. Portanto essa função permanece indisponível, sem substituí-la por bloquear/desbloquear.

A revisão 0.2.1 trata duas classes de falha: comunicação ausente com uma aba já aberta e identidade de perfil que não é reconhecida pelo seletor anterior. Os relatos recebidos mostraram esses sintomas em momentos diferentes; não houve inspeção autorizada do DOM real suficiente para atribuir uma causa exata a cada imagem. As mudanças são fundamentadas no código e nas fontes abaixo, sem afirmar validação real da conta.

## Fontes oficiais atuais

1. [TikTok: Requesting your data](https://support.tiktok.com/en/account-and-privacy/personalized-ads-and-data/requesting-your-data). Caminho publicado: Perfil → Menu → Configurações e privacidade → Conta → Baixar seus dados; selecionar informações e formato, solicitar, aguardar e baixar. O arquivo pode demorar dias para preparar, fica disponível até quatro dias e algumas categorias podem não incluir as últimas 24–48 horas. Dados que afetam a privacidade de outras pessoas também podem não ser entregues. O texto foi recuperado pelo índice oficial de busca; a abertura direta sem parâmetros foi bloqueada pelo robots.txt.
2. [Data Portability API: Data Types](https://developers.tiktok.com/docs/en/data-portability-data-types), atualizado em 28/08/2026. Confirma em **Profile and settings**: **Follower** (`Date`, `Username`), **Following** (`Date`, `Username`) e **Profile Information** (`Username`, `Nickname`, `Follower Count`, `Following Count`, entre outros). A documentação também alerta que arquivos/seções podem faltar ou estar vazios quando a funcionalidade/dados não estão presentes. É um catálogo de campos, não um esquema JSON nem um exemplo TXT estável.
3. [Data Portability API: produto](https://developers.tiktok.com/products/data-portability-api/) e [Get Started](https://developers.tiktok.com/docs/en/data-portability-api-get-started), guia atualizado em 10/09/2026. A API abrange atualmente usuários no EEE/Reino Unido, exige aprovação do aplicativo, Login Kit e escopos. Não resolve uma extensão local geral para uma conta no Brasil. Exportações seguintes retornam o conjunto da categoria, não um feed de eventos.
4. [Display API: Overview](https://developers.tiktok.com/docs/en/display-api-overview), atualizado em 04/08/2026. As três APIs apresentadas são perfil básico, lista de vídeos e consulta de vídeos. Não fornece lista de relações nem operações de unfollow/remover seguidor nesse produto.
5. [Research API: Query User Followers](https://developers.tiktok.com/docs/en/research-api-specs-query-user-followers) e [Research Codebook](https://developers.tiktok.com/docs/en/research-api-codebook), codebook atualizado em 10/09/2026. Listas existem para pesquisa aprovada e usuários públicos adultos, com mais requisitos de visibilidade para following. Isso não equivale a uma API de gerenciamento da conta pessoal.
6. [Following and unfollowing](https://support.tiktok.com/en/using-tiktok/followers-and-following/following-and-unfollowing): oficialmente, no app, abrir o perfil e tocar em Following para deixar de seguir.
7. [Removing followers](https://support.tiktok.com/en/using-tiktok/followers-and-following/removing-followers): oficialmente, no app, Perfil → Seguidores → Mais ações ao lado da pessoa → Remove this follower. Conteúdo confirmado pelo índice de busca oficial; a abertura direta foi bloqueada pelo robots.txt. Não comprova disponibilidade equivalente no navegador.

## Formatos JSON observados em fontes primárias

O nome do arquivo não deve ser usado como prova do seu conteúdo. `user_data.json` e `user_data_tiktok.json` são nomes encontrados no ecossistema; o parser precisa validar estrutura e linhas. Não tratar seção faltante como lista vazia.

| Origem | Seguidores | Seguindo | Perfil / linhas |
| --- | --- | --- | --- |
| [NotFollow: tiktok.astro](https://github.com/gvoze32/NotFollow/blob/main/src/pages/tiktok.astro) | `Profile.Follower List.FansList`; `Profile.Follower.FansList`; `Profile And Settings.Follower.FansList`; `Follower.FansList` | Correspondentes `Following List` ou `Following`, com array `Following` | Cada linha usa `UserName` |
| [zollo: data_structure.yml](https://github.com/zollo/tiktok-downloader/blob/main/data_structure.yml) | `Activity.Follower List.FansList` | `Activity.Following List.Following` | Linhas `Date` / `UserName`; `Profile.Profile Information.ProfileMap.userName` |
| [HUDI: service.tiktok.ts](https://github.com/humandataincome/hudi-packages-connectors/blob/master/src/source/tiktok/service.tiktok.ts) | `Activity.Follower List.FansList` | `Activity.Following List.Following` | Linhas `Date` / `UserName`; perfil em `Profile Information.ProfileMap` |

TXT: o catálogo oficial confirma `Date` e `Username`, mas não oferece amostra TXT suficiente para validar variações de idioma, mensagens de lista vazia ou nomes exatos de arquivo. Se implementado, aceitar somente o formato explícito suportado e informar o erro para variantes desconhecidas. Não houve acesso a uma exportação real da conta do usuário nesta pesquisa.

## Projetos abertos e licenças verificadas

| Projeto | Licença verificada | Utilidade e limite |
| --- | --- | --- |
| [davidteather/TikTok-Api](https://github.com/davidteather/TikTok-Api) | [MIT, ©2019 David Teather](https://github.com/davidteather/TikTok-Api/blob/main/LICENSE) | Wrapper Python. O próprio README diz que não suporta rotas autenticadas; não serve para administrar relações da conta. Não incorporado. |
| [Kotmir/tiktok-auto-unfollow](https://github.com/Kotmir/tiktok-auto-unfollow) | [MIT, ©2026 Amir Saypov](https://github.com/Kotmir/tiktok-auto-unfollow/blob/main/LICENSE) | Evidência de extensão MV3 atuando no DOM. Código usa seletores muito amplos e conta clique como sucesso; não fornece validação adequada para reutilização direta. Não incorporado. |
| [SouthVirginia19/tiktok-unfollow-non-mutuals](https://github.com/SouthVirginia19/tiktok-unfollow-non-mutuals) | [MIT, ©2026 SouthVirginia19](https://github.com/SouthVirginia19/tiktok-unfollow-non-mutuals/blob/main/LICENSE) | `script.js` observa `follow-user`, `follow-button`, `unfollow-confirm`. Faz re-clique quando a resposta é incerta, inadequado para os requisitos. Evidência de seletores apenas; não incorporado. |
| [raphaelsalaja/pond](https://github.com/raphaelsalaja/pond) | [MIT, ©2026 Raphael Salaja](https://github.com/raphaelsalaja/pond/blob/main/LICENSE) | [Extrator TikTok](https://github.com/raphaelsalaja/pond/blob/main/apps/desktop/src/main/core/pipeline/extractors/sources/tiktok.ts) observa links `a[data-e2e="nav-profile"]`, `bottom-nav-profile`, `profile-icon` e extrai o @ do `href`. Evidência de DOM apenas; não incorporado. |
| [whiteguo233/OpenBiliClaw](https://github.com/whiteguo233/OpenBiliClaw) | [MIT, ©2026 OpenBiliClaw Contributors](https://github.com/whiteguo233/OpenBiliClaw/blob/main/LICENSE) | [Integração TikTok](https://github.com/whiteguo233/OpenBiliClaw/blob/main/extension/src/content/tiktok.ts) usa `nav-profile`, clica em `following-count` para abrir Seguindo e rola o contêiner da lista. Evidência de sessão/DOM, sem incorporação de código. |
| [GLVictoria/tiktok-unfollow](https://github.com/GLVictoria/tiktok-unfollow) | [MIT, ©2026 Luis](https://github.com/GLVictoria/tiktok-unfollow/blob/main/LICENSE) | [content.js](https://github.com/GLVictoria/tiktok-unfollow/blob/main/content.js) encontra `follow-info-popup`, um descendente com overflow rolável e executa `scrollBy`. Critérios de parada desse projeto não foram adotados como prova de completude. Código não incorporado. |
| [gvoze32/NotFollow](https://github.com/gvoze32/NotFollow) | [GNU AGPL versão 3](https://github.com/gvoze32/NotFollow/blob/main/LICENSE) | Usado somente para verificar variantes de formato. Não copiar o código para a base MIT. |
| [zollo/tiktok-downloader](https://github.com/zollo/tiktok-downloader) | [GNU GPL versão 3](https://github.com/zollo/tiktok-downloader/blob/main/LICENSE) | Usado somente para verificar estrutura de dados legada. Não copiar o código. |
| [humandataincome/hudi-packages-connectors](https://github.com/humandataincome/hudi-packages-connectors) | Não verificada: `LICENSE` na raiz retornou 404 | Evidência adicional de formato; nenhum código deve ser incorporado. |

## Evidências primárias para contador e rolagem

- [OpenBiliClaw, integração TikTok](https://github.com/whiteguo233/OpenBiliClaw/blob/23de203a72a9b59d2c555d66b9e70ab75583aa2c/extension/src/content/tiktok.ts), na função de abertura de Seguindo: observa `[data-e2e="following-count"]` e efetua um clique para abrir a lista. Na coleta, escolhe um contêiner e altera sua posição de rolagem antes de ler novos elementos.
- [OpenBiliClaw, dom-extractor.ts](https://github.com/whiteguo233/OpenBiliClaw/blob/main/extension/src/content/tt/dom-extractor.ts): encontra o ancestral rolável dos links de perfil por `overflowY` e dimensões; também reconhece `[data-e2e="follow-info-popup"][role="dialog"]` e o identificador de proprietário no cabeçalho.
- [GLVictoria, content.js](https://github.com/GLVictoria/tiktok-unfollow/blob/a552fd9425a643e58222aa37ebd1cf454f93294b/content.js): observa o popup `[data-e2e="follow-info-popup"]`, procura overflow `auto`/`scroll` com conteúdo maior que a área e rola esse contêiner.

Essas fontes demonstram técnicas usadas por seus autores. Não certificam que os seletores funcionam hoje em toda conta ou que um contador abreviado representa um número exato. Não foi encontrada uma especificação oficial do DOM ou uma garantia oficial de completude da lista web. Por isso, a implementação não transforma `1K` em prova de 1.000 registros nem usa ausência de novas linhas como prova de lista completa.

## Evidências para título, subtítulo e conexão — revisão 0.2.1

- [OpenBiliClaw, integração TikTok](https://github.com/whiteguo233/OpenBiliClaw/blob/23de203a72a9b59d2c555d66b9e70ab75583aa2c/extension/src/content/tiktok.ts), função `ownProfileVisible`, e [documentação do módulo](https://github.com/whiteguo233/OpenBiliClaw/blob/23de203a72a9b59d2c555d66b9e70ab75583aa2c/docs/modules/tiktok.md): descrevem layout em que `user-title` contém o apelido e `user-subtitle` contém o @usuário. Os seletores não restringem a tag HTML. A licença MIT foi verificada na seção de projetos.
- [Teste de ciclo de vida do mesmo projeto](https://github.com/whiteguo233/OpenBiliClaw/blob/23de203a72a9b59d2c555d66b9e70ab75583aa2c/extension/tests/tt-content-lifecycle.test.ts): inclui uma variante com título de exibição e subtítulo de conta. É evidência primária de um caso tratado por outro implementador, não uma inspeção da página do usuário.
- [Chrome: API scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting): documenta execução de arquivos da extensão numa aba, com a permissão `scripting` e acesso ao domínio; distingue o contexto isolado da extensão do contexto da página.
- [WXT: Content Scripts, Context](https://wxt.dev/guide/essentials/content-scripts.html#context): documenta a invalidação do contexto após mudanças na extensão e mecanismos para interromper código assíncrono. O projeto usa o contexto para cancelar operações e retirar o receptor antigo quando invalidado.

Decisão implementada: a navegação identifica a sessão; a URL e um identificador visível independente identificam o perfil visitado. Havendo subtítulo visível, seu texto inteiro tem prioridade e precisa corresponder exatamente ao perfil esperado e ao endereço. Um subtítulo inválido ou divergente não permite recorrer ao apelido. Só na ausência de subtítulo visível o título serve de alternativa. Campos de hidratação não são usados isoladamente para autorizar cliques, pois podem descrever outro perfil ou um documento anterior numa navegação do site.

Para a comunicação, somente o erro específico de receptor ausente numa consulta de estado permite uma tentativa de reposição do leitor local e uma releitura. A recuperação não repete mensagens de ação e fica bloqueada durante coletas/lotes ativos. Erros de permissões, outros erros de transporte e resultados de ação incertos não geram tentativas sucessivas. Isso reduz a dependência de uma aba ter sido aberta depois da instalação, sem transformar falhas incertas em reenvios.

## Regras decorrentes da evidência

### Popup e linhas da lista na versão 0.2.2

O [extrator MIT do OpenBiliClaw](https://github.com/whiteguo233/OpenBiliClaw/blob/23de203a72a9b59d2c555d66b9e70ab75583aa2c/extension/src/content/tt/dom-extractor.ts#L467) observa um popup `follow-info-popup` cujo `h1` identifica o proprietário; esse título não comprova qual lista está selecionada. Sua validação de popup vazio se limita a uma mensagem explícita de Seguindo. O [GLVictoria, MIT](https://github.com/GLVictoria/tiktok-unfollow/blob/a552fd9425a643e58222aa37ebd1cf454f93294b/content.js#L439) também usa linhas `li`, sem exigir a marcação `follow-user`. São evidências de variantes de estrutura, não inspeção da página do usuário. Nenhum código dessas fontes foi incorporado.

A coleta automática mantém a identificação por título quando disponível. Para um popup sem tipo identificável, exige a abertura de um único popup específico pelo clique do próprio leitor no contador Seguindo do próprio perfil. Não aproveita um popup desconhecido já aberto. Interação com a aba, sinais conflitantes e mudança de contexto interrompem a leitura. A alternativa de linhas fica dentro da lista validada e conserva a exigência de um único perfil canônico por linha. Não se usa uma suposição global “todo popup é Seguindo”, nem se alteram as regras de cliques de relacionamento ou de captura manual.

- Relações do arquivo descrevem o que consta na exportação, sujeitas ao atraso e às omissões do TikTok. Exibir a origem, horário de importação e estado de completude de cada lista.
- Detectar ausência/novidade só comparando duas listas estruturalmente completas da mesma conta. Uma exportação parcial, leitura cancelada ou DOM que parou de crescer não comprovam que o seguidor saiu.
- Registrar `detectedAt` no momento da comparação. O `Date` presente em uma linha não é a data de uma perda posterior. Mudança de @ ou conta removida também pode aparecer como ausência/entrada quando o arquivo não traz um ID estável.
- O DOM de um perfil visitado ou `webapp.user-detail` não prova qual conta está conectada. Para operações, exigir identidade da navegação da própria conta, rejeitar estados ausentes/ambíguos e conferir novamente imediatamente antes de cada ação.
- Unfollow: experimental até teste real; revisão explícita por @, protegidos revistos no último momento, uma tentativa por perfil, nenhuma repetição automática de resultado incerto. Depois do clique, observar transição verificável; em dúvida, interromper e registrar incerteza.
- Lista DOM: conservar como parcial a menos que haja contagem exata verificável e todos os perfis correspondam à lista esperada. A conferência 0.2.0 limita-se a Seguindo e é guardada em `followingCollection`; a análise de navegador mantém `Snapshot.complete = false`. Não usar pausas curtas, fim de rolagem ou ausência de novas linhas como prova de completude.
- Fila de unfollow: alvos imutáveis da revisão, ligados à mesma análise; abrir cada perfil, aguardar seu identificador renderizado, verificar Seguindo/Amigos e registrar a tentativa antes do clique. Conta, protegidos e análise são revalidados; não repetir resultado incerto e não retomar automaticamente após reinício.
- Desafio de segurança, bloqueio, perda de sessão, mudança de conta, alvo divergente ou cancelamento interrompem a operação. Não solucionar CAPTCHA ou contornar bloqueios.
- Remover seguidor: indisponível nesta versão por falta de método verificável no navegador. Instruir a ação manual oficial no app quando necessário.

## Validação ainda necessária

Não foram testados os seletores no TikTok autenticado, o sucesso no servidor após unfollow, os idiomas/experimentos do site, a captura completa de listas nem arquivos oficiais reais do usuário. Fixtures sintéticas podem testar as regras e estruturas descritas, mas não certificam a integração real. Nenhum endpoint interno foi proposto ou usado.

## Conferência do reaproveitamento do ZIP elo Instagram

Revisão local do código fornecido e da implementação TikTok em desenvolvimento:

- `lib/tracker/diff.ts` da referência e `lib/diff.ts` do TikTok contêm a mesma implementação de diferença de conjuntos e cálculo de mútuos/fãs/não recíprocos. Esse é reaproveitamento apropriado: lógica pura sem endpoints, domínio ou sessão Instagram.
- `lib/panel/view.ts`, funções `csvField`/`toCsv`, foi adaptado em `lib/export.ts`; manteve a proteção de fórmulas de planilhas e ampliou a validação para prefixos com espaços.
- Os quatro ícones `16.png`, `32.png`, `48.png` e `128.png` são idênticos por SHA-256 aos ícones no código fornecido. O reaproveitamento visual deve ser documentado como proveniente do elo Instagram.
- `wxt.config.ts` mantém a configuração Preact, imports explícitos, inicialização manual do navegador e o hook que inclui `LICENSE` no compilado. As permissões e domínio foram definidos para o TikTok; a integração Instagram não foi transportada.
- A licença raiz preserva integralmente MIT e os copyrights fornecidos: David Arroyo (2023), Edvin (2025–2026) e IgDiff contributors (2026). Os avisos de Preact, idb e WXT acompanham `public/licenses` e `THIRD-PARTY-NOTICES.txt`.
- `NOTICE.md` da referência identifica a base [mzhao1599/igdiff](https://github.com/mzhao1599/igdiff), revisão `2f5e3480fb7b8bf0418ecda98336b7dc0b0bbc2e`. Recomenda-se preservar essa proveniência em um aviso próprio do elo TikTok e indicar quais componentes foram reutilizados.
