# Validação — elo TikTok 0.2.2

Entrega de 26/10/2026, no Windows, com Node.js 24.18.0, WXT 0.21.4, TypeScript 5.9.3 e Microsoft Edge 155.0.4283.62. Nenhuma conta TikTok real foi acessada ou alterada.

| Verificação | Resultado |
| --- | --- |
| TypeScript (`npm run typecheck`) | Passou |
| Testes automatizados (`npm test`) | 155 passaram, sem falhas ou testes ignorados |
| Compilação (`npm run build`) | Passou: Manifest V3, Chrome/Edge |
| Extensão instalada em Edge descartável (`npm run test:ui`) | 19 verificações passaram com dados e páginas artificiais |
| Regressão de conexão em Edge descartável (`npm run test:connection`) | 6 verificações passaram, sem acessar conta real |
| Inspeção visual | Interface conferida em 1440px e 390px; sem transbordamento horizontal externo a 390px |

## Leitura direta e revisão de todos

Uma conta artificial nova, sem arquivo importado, foi identificada pelo link de navegação. O pacote real da extensão abriu seu perfil, aguardou o novo documento, abriu Seguindo e rolou o contêiner. A lista artificial substituía linhas ao rolar, para verificar acumulação de perfis virtualizados. Três nomes foram reunidos com o contador exato de três.

O gerenciador salvou somente a prova da lista Seguindo: `followingCollection.complete=true`, com `Snapshot.complete=false`. Nenhum seguidor, relação recíproca ou perda foi inventado. O botão de revisar todos excluiu um protegido. Cancelar essa revisão não acionou controles de relacionamento. Após desproteger esse perfil e confirmar a revisão da conta artificial, a fila navegou pelos três perfis, observou as mudanças dos botões e registrou os resultados. Cada perfil recebeu uma única tentativa e ficou fora de novo envio.

Todas as navegações foram respondidas por HTML sintético no próprio teste. Nenhum endpoint de TikTok foi consultado; as demais requisições HTTPS foram bloqueadas. As alterações ocorreram apenas nos botões da fixture e numa lista em memória do teste. Nada disso é dado inicial do aplicativo entregue.

## Regras cobertas pelos 155 testes

- JSON/TXT conhecidos, identificação do dono do pacote, arquivos incompatíveis, duplicatas e contagens divergentes; exportação e sanitização de CSV.
- IndexedDB e protegidos separados por conta; cronologia, comparação somente entre duas análises completas e horário de detecção.
- Contadores zero, ausentes, ambíguos e abreviados; contêiner rolável real, virtualização, retorno ao topo e cinco tentativas sem novos nomes.
- Cancelamento, limite de tempo, bloqueio/desafio e mudança de conta, perfil, endereço, lista ou visibilidade tornam a coleta parcial.
- Autorização de mensagens, exclusão de protegidos e tentativas anteriores, seleção vinculada à análise revisada, revisão com prazo e limite.
- Fila por perfil, intervalo cancelável, uma tentativa persistida antes de cada ação; resultado incerto interrompe e impede reenvio.
- Título visível correspondente ao endereço; confirmação separada da lista e específica ao alvo; estado visual estável e reversão incerta.
- Navegação aguarda `loading` seguido de `complete` da aba correta, inclusive na mesma URL; estado do documento antigo, redirecionamento, falha de atualização e tempo excedido não liberam a operação.
- Coleta e ações não executam simultaneamente; troca da análise revisada invalida a autorização antes do clique.

## Fluxos de interface adicionais

O teste do pacote instalado também verifica importação opcional completa e parcial, diferença entre pacotes, protegidos, CSV da análise histórica selecionada, JSON com histórico, persistência após recarregar, busca, troca de conta, impedimento de ações pela conta errada e ausência de erros JavaScript.

## Limites da validação

Não foram verificados os seletores, a sessão, os desafios ou os efeitos de unfollow no TikTok real. O status “Interface confirmou” representa uma mudança visual observada, sem garantia independente do servidor. Contagem abreviada ou lista que não termina mantém a leitura parcial; a extensão não promete reunir todos os perfis nesses casos.

O pacote comum Chromium foi exercitado no Edge, não no Chrome pessoal do usuário. Arquivos oficiais reais, listas muito grandes, uso prolongado, disco cheio e persistência após mudanças de versão do site continuam dependendo de validação específica. Não há retomada automática de fila após reinício do serviço da extensão. Remover seguidores e Android permanecem indisponíveis.

## Reproduzir

```powershell
npm ci
npm run check
$env:ELO_CHROME_EXECUTABLE = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:ui
```

O teste usa um perfil novo e descartável, nunca o perfil pessoal do Edge. Ajuste o caminho conforme a instalação. Evidências ficam em `ui-evidence` ao lado do projeto. Sem essa variável, o Playwright precisa de seu Chromium de testes instalado.

## Regressão de conexão e layout na versão 0.2.1

`npm run test:connection` passou em seis verificações adicionais. Cópias descartáveis do pacote tiveram somente o manifesto modificado para impedir a injeção automática ou retirar a permissão de host; todos os arquivos JavaScript foram conferidos por SHA-256 e mantiveram exatamente os bytes do compilado entregue.

O teste reproduziu o erro nativo de destinatário inexistente, recuperou a comunicação por injeção do arquivo empacotado e reconheceu uma página artificial com apelido em user-title e @usuário em user-subtitle. Uma segunda consulta reutilizou a conexão. Duas reinjeções explícitas removeram o ouvinte anterior e registraram um substituto por vez. O próprio Edge negou acesso na variante sem permissão, e o gerenciador exibiu uma orientação em português. Nenhum botão de alterar relacionamento foi clicado nesse teste.

Os testes de unidade também verificam que uma falha numa ação não provoca reinjeção nem reenvio, que uma operação em andamento bloqueia a reconexão e que a recuperação inicial não autoriza uma conta diferente. O subtítulo inválido ou conflitante não é substituído por um apelido coincidente. Um título continua sendo aceito quando não há subtítulo.

Evidências: resultado-conexao.json, conexao-recuperada.png e conexao-permissao-negada.png na pasta de evidências do teste. Esses arquivos descrevem testes sintéticos, sem dados da conta real do usuário.

## Regressão do popup Seguindo na versão 0.2.2

A fixture do pacote instalado passou a usar apelido no título, @usuário no subtítulo, popup com cabeçalho @proprietário e abas em elementos `div`, sem inventar `aria-label="Seguindo"`, títulos de tipo de lista ou seleção ARIA. As linhas são `li` sem `follow-user`, com links de avatar/identificador para o mesmo perfil e botão Seguindo. A coleta abriu o popup pelo contador da própria conta, rolou o contêiner e reuniu os três perfis esperados sem clicar em botões de relacionamento.

Em outra conta artificial, o teste aguardou a leitura das primeiras duas linhas e clicou de fato na aba Seguidores. A fixture substituiu as linhas por outro perfil. A operação parou como parcial e não incorporou esse seguidor à lista Seguindo. A leitura normal, a revisão de todos e a fila de ações artificiais permaneceram verificadas separadamente.

Os testes de unidade cobrem popup desconhecido preexistente, popup genérico recém-aberto, elemento antes oculto que fica visível após o clique, múltiplos popups, sinais de Seguidores/conflito, proprietário divergente, eventos de clique/teclado e mudança de seleção acessível. Também cobrem linhas marcadas e comuns misturadas, links duplicados do mesmo perfil, recomendações com Seguir, linhas ambíguas e retirada dos ouvintes após sucesso ou interrupção.

A identificação compartilhada de listas para captura manual e ações não foi relaxada. As permissões, o armazenamento e a regra de comparar perdas somente com listas completas permanecem iguais. Essas verificações reproduzem estruturas controladas e não substituem a inspeção da página real do usuário.
