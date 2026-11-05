# Funções e limitações — elo TikTok 0.2.2

Este documento descreve o comportamento da implementação. Resultados de testes pertencem a `VALIDACAO.md`; esta lista não certifica funcionamento no TikTok real.

## Disponível na implementação

- Extensão Chromium MV3 para Chrome/Edge no Windows, com TypeScript, Preact, WXT e IndexedDB.
- Importação local de variantes reconhecidas do JSON oficial e de um formato TXT estrito.
- Listas de seguidores/seguindo; cálculo de não recíprocos, fãs e mútuos quando ambas são completas declaradas.
- Histórico por conta e comparação somente entre análises completas, com horário de detecção.
- Busca, seleção paginada e perfis protegidos por conta.
- JSON da conta e CSV da análise exibida.
- Leitura da lista Seguindo pela sessão já aberta, com abertura do contador, rolagem do contêiner e conferência de quantidade quando o total exibido é exato.
- Captura de linhas já carregadas no site, sempre parcial.
- Revisão de todos os perfis elegíveis da lista lida, ou de uma seleção, seguida de fila de unfollow que abre os perfis individualmente; recurso experimental.

## Formatos de importação — opcionais

Extraia o ZIP oficial antes de escolher arquivos. A extensão não lê o ZIP diretamente, não solicita exportações e não recebe dados por uma API TikTok.

Arquivos não são necessários para Ler quem sigo e revisar ações sobre esses nomes. Continuam sendo uma alternativa para analisar seguidores, reciprocidade e mudanças quando ambas as listas do pacote estão completas declaradas.

O JSON precisa conter seções de perfil ou listas conhecidas, por exemplo `Profile`, `Profile And Settings` ou `Activity`; listas `Follower List`/`Follower` com `FansList` e `Following List`/`Following` com `Following`. Linhas usam campos de nome de usuário reconhecidos, incluindo `UserName` e `Username`. Isso não é uma promessa de suportar todo pacote que o TikTok produza: o serviço já alterou sua estrutura e não publica um esquema JSON estável completo.

Para TXT, os nomes aceitos são `Follower.txt`, `Follower List.txt`, `Followers.txt`, `Following.txt`, `Following List.txt`, `Profile Info.txt` e `Profile Information.txt`. Os rótulos das listas devem ser `Date:` e `Username:`/`UserName:`, em inglês, com um par preenchido por registro. A implementação não interpreta traduções, cabeçalhos desconhecidos nem mensagens de lista vazia. Um TXT vazio não comprova uma lista completa vazia; use JSON com estrutura explícita nesse caso.

Limites do gerenciador: 80 MB por arquivo e 100 MB no total. O parser também limita a 500 arquivos e um milhão de registros por lista. Contas conflitantes, seções duplicadas, nomes inválidos e registros repetidos são recusados ou tornam a lista inválida para completude. A leitura e a validação local de arquivos grandes podem levar algum tempo; cancelar não desfaz dados já salvos anteriormente.

## Completude, datas e identidade

A presença de duas listas válidas não prova que o TikTok incluiu todas as relações atuais. O usuário precisa conferir a conta, a data e a completude do pacote. Contagens inteiras exatas do perfil, quando presentes, precisam corresponder às listas; divergências bloqueiam completude. A interface usa a expressão “completa declarada”. Se uma seção falta, é inválida ou foi capturada no navegador, ela não permite cálculos de reciprocidade ou perdas.

O TikTok alerta que certas categorias podem omitir as últimas 24–48 horas e informações que afetem terceiros. Mesmo uma exportação recente pode não refletir a conta ao vivo. As contagens apresentadas pertencem aos dados importados ou capturados.

Uma nova análise precisa ter data de referência posterior à última salva, inclusive quando a anterior é parcial. Arquivos repetidos são recusados. Importar um pacote antigo depois de uma captura recente não altera retroativamente o histórico. A primeira base completa não tem uma base anterior para comparação.

As comparações registram o momento da detecção na importação. “Ausente na nova lista” é uma observação entre arquivos completos declarados, sem afirmar o motivo nem a data real da saída. Renomeações, desativação de conta, exclusão e omissões do serviço podem ter efeito semelhante. O projeto identifica pessoas e contas pelo @usuário, não por um ID TikTok estável.

## Leitura e captura no navegador

A extensão reconhece a conta conectada pelo link de perfil da navegação da página. Um perfil visitado de outra pessoa não serve como identificação da sessão. Se o link não estiver visível ou houver ambiguidade, a operação é recusada.

A conta conectada e o perfil renderizado são conferências separadas. A identificação do perfil aceita elementos genéricos com `data-e2e="user-title"` ou `data-e2e="user-subtitle"`. Quando há subtítulo visível, ele tem prioridade e seu texto inteiro precisa ser um @usuário válido que corresponda exatamente ao endereço e ao perfil esperado. Um subtítulo inválido, ambíguo ou divergente não permite usar o apelido do título como alternativa. O título só é usado quando não há subtítulo visível. A correção amplia o reconhecimento de layouts sem reduzir a verificação de identidade.

Uma consulta explícita de estado que encontre o erro de receptor ausente pode tentar uma única reinjeção do leitor empacotado, seguida de uma releitura. Isso exige as permissões `scripting` e de acesso ao TikTok. Consultas concorrentes compartilham a recuperação em curso. Não se repete uma mensagem de ação, não se recupera por reinjeção durante coleta/lote ativo e não se insiste diante de outros erros. Quando o contexto WXT é invalidado, o leitor cancela suas operações e retira seu receptor de mensagens.

Mensagens de espera distinguem falta de conexão, sessão, endereço de perfil, identificador renderizado e botão disponível. Esses sinais ajudam a localizar a falha; uma captura de tela ou o reconhecimento do menu Perfil, isoladamente, não comprovam a causa nem autorizam pular a checagem do perfil.

A função **Ler quem sigo no TikTok** navega ao próprio perfil, aguarda o identificador visível compatível com a URL e abre Seguindo clicando em um contador único. A extensão acumula @usuários enquanto rola somente um contêiner inequívoco dessa lista. Não rola a página inteira como substituto e não clica em controles de relacionamento nessa etapa.

Quando o popup não expõe um título de tipo de lista, a coleta automática aceita somente um novo `follow-info-popup` que ficou visível após o clique do próprio leitor no contador Seguindo. Um popup sem tipo identificável já aberto, diálogos genéricos, múltiplos popups e sinais de Seguidores são recusados. A leitura fica vinculada àquele elemento; interação com a aba ou troca/substituição do popup a interrompem. Essa prova de abertura vale só para a coleta automática; não altera os requisitos de ações nem da captura manual.

Além das linhas `follow-user`, o coletor reconhece linhas `li` dentro do popup com um único perfil canônico e um único botão visível no estado Seguindo/Following/Amigos/Friends. Recomendações com botão Seguir não entram nessa alternativa. Estruturas sem esses sinais continuam sem suporte; não se recorre a todos os links da página para preencher a lista.

A lista Seguindo recebe uma conferência separada de quantidade somente se o contador exato permanece igual antes e depois e o número de @usuários únicos corresponde ao total. Zero também pode ser conferido explicitamente. Não se expandem abreviações como `1K` ou `1,2 mil` para inventar uma quantidade exata. Contadores ausentes/ambíguos/abreviados mantêm a coleta parcial.

O fim da rolagem não é prova de completude. Cinco tentativas sem novos nomes, ausência de contêiner rolável ou limite de 5.000 rolagens/30 minutos encerram a leitura como parcial se a quantidade esperada não foi conferida. Conta, perfil, página, tipo de lista, segurança e cancelamento são conferidos durante a leitura; interrupções não produzem conferência completa.

Essa evidência refere-se **somente a Seguindo** e ao que a interface exibiu durante a coleta. Não é uma captura atômica do servidor. Não lê todos os seguidores, não marca a análise geral como completa e não habilita perdas, reciprocidade ou mútuos. Os dados do navegador mantêm `Snapshot.complete = false`; a conferência de Seguindo é registrada separadamente em `followingCollection`.

O botão **Revisar todos que sigo** aparece para uma leitura de Seguindo conferida. **Revisar perfis lidos** explicita que só os nomes encontrados podem entrar numa revisão parcial. Para um pacote completo declarado, **Revisar todos da análise** se refere à data daquele pacote. Em todos os casos, protegidos e tentativas anteriores são excluídos.

A opção adicional **Capturar listas abertas** continua lendo apenas as linhas já carregadas de Seguidores ou Seguindo, sem rolagem automática, e continua sempre parcial. Os dois fluxos podem falhar quando o TikTok muda a estrutura, idioma ou experiências da página.

## Unfollow experimental

A implementação utiliza controles visíveis do site, sem uma API oficial para administrar relações. Seletores, rótulos, diálogos e experiências do TikTok podem variar. O adaptador reconhece apenas estados específicos em português/inglês e prefere interromper diante de ambiguidade.

- Revisão de 1 a 10.000 alvos, válida por cinco minutos; confirmação do @ da conta no gerenciador.
- Protegidos e alvos com tentativa pendente, incerta ou com mudança observada ficam fora. A revisão pertence à conta e à análise que forneceu os nomes.
- Ao começar, a aba TikTok é ativada e deve permanecer visível. A extensão abre cada perfil individualmente, aguarda o identificador renderizado e um botão compatível com Seguindo/Amigos. Não exige deixar todos os alvos carregados no diálogo da lista.
- Conta, contexto, alvo, análise revisada e protegidos são conferidos antes dos cliques. A tentativa é registrada localmente antes do primeiro clique e não há reenvio automático da alteração para um alvo.
- Um diálogo de confirmação precisa identificar explicitamente o @ do alvo; se não o fizer, a extensão não o confirma.
- Resultados incertos ou comunicação interrompida encerram o lote. Tentativas enviadas/pendentes, incertas e com mudança observada não são reenviadas pela extensão.
- Cancelar impede os próximos cliques. Uma ação já enviada pode ter ocorrido e precisa de conferência manual se o resultado não for verificável.
- Desafio de segurança, bloqueio ou mudança de conta interrompem a operação. O elo não contorna restrições nem resolve desafios automaticamente.
- O botão precisa permanecer em Seguir por quatro observações consecutivas (cerca de um segundo). Uma reversão nesse período encerra como incerta. Ainda é observação da interface, sem confirmação independente de persistência no servidor.
- O lote não retoma após reinício do serviço da extensão. O diário persistente impede reenvio de tentativas pendentes ou incertas.
- Há uma pausa de dois segundos entre perfis concluídos. Essa pausa não estabelece uma cota permitida pelo TikTok nem garante que um lote grande será concluído.

Nenhum intervalo ou tamanho de lote garante ausência de limitações impostas pelo TikTok. O comportamento real ainda precisa ser verificado na versão do site e na conta do usuário, mediante autorização específica para ações.

## Remover seguidores

Indisponível. A ajuda oficial confirma o procedimento no aplicativo, mas esta pesquisa não confirmou um método verificável equivalente no navegador. Bloquear e desbloquear não são usados como substituto.

## Exportação, armazenamento e recuperação

O CSV contém a análise exibida e a proteção atual. As colunas de completude geral e `seguindo_completo` distinguem as evidências. Se a análise é parcial, um campo de presença falso significa apenas que o nome não está naquela lista capturada; não prova ausência da relação no TikTok. Uma lista Seguindo conferida não torna conhecida a lista de seguidores.

O JSON contém todo o histórico local da conta selecionada, mas a reimportação recupera somente a análise mais recente. Proteções, ações e análises anteriores não são restauradas; um arquivo parcial permanece parcial. A conferência de Seguindo observada no DOM não é reaplicada como prova ao reimportar o arquivo. Não há restauração integral de backup, sincronização entre dispositivos nem importação do histórico do elo Instagram.

Os dados ficam no IndexedDB `elo-tiktok` do perfil de navegador em que a extensão foi carregada. Desinstalação, limpeza de dados ou perda desse perfil podem apagar o histórico. Não há interface própria para excluir uma análise individual nesta versão. Arquivos exportados continuam no local escolhido pelo usuário.

Para atualizar uma instalação 0.1 ou 0.2, extraia os arquivos 0.2.2 na mesma pasta já carregada, recarregue a extensão e recarregue o TikTok. Não carregue uma segunda cópia: uma pasta diferente pode criar outra identidade de extensão e deixar o histórico anterior inacessível. Exporte antes de desinstalar ou mudar a instalação.

## Fora desta etapa

Android, aplicativos móveis, publicação em lojas, leitura automática completa dos seguidores, execução agendada, notificações de mudanças em tempo real, automação de follow, remoção de seguidores e restauração integral do JSON não foram incluídos.

## Fontes oficiais

- [Solicitar e baixar dados](https://support.tiktok.com/en/account-and-privacy/personalized-ads-and-data/requesting-your-data): atraso, disponibilidade e possíveis omissões.
- [Data Types](https://developers.tiktok.com/docs/en/data-portability-data-types): campos oficiais de perfil, seguidores e seguindo.
- [Data Portability API](https://developers.tiktok.com/products/data-portability-api/) e [Get Started](https://developers.tiktok.com/docs/en/data-portability-api-get-started): cobertura EEE/Reino Unido e aprovações necessárias.
- [Display API](https://developers.tiktok.com/docs/en/display-api-overview): perfil e vídeos; não oferece gerenciamento de relações nesse produto.
- [Following and unfollowing](https://support.tiktok.com/en/using-tiktok/followers-and-following/following-and-unfollowing) e [Removing followers](https://support.tiktok.com/en/using-tiktok/followers-and-following/removing-followers): procedimentos manuais oficiais.
- [Pesquisa detalhada e licenças dos projetos examinados](PESQUISA.md).
- [API scripting do Chrome](https://developer.chrome.com/docs/extensions/reference/api/scripting) e [contexto de content scripts no WXT](https://wxt.dev/guide/essentials/content-scripts.html): permissões, execução de arquivo empacotado e invalidação do contexto.
