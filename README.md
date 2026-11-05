# elo TikTok 0.2.2

Esta cópia contém somente o código-fonte, preparado para um futuro repositório privado. Não inclui o ZIP compilado mencionado abaixo. Para gerar a extensão, execute `npm ci` e `npm run build`; carregue `.output/chrome-mv3` na página de extensões. Nenhum repositório remoto foi criado nesta preparação.

Extensão gratuita e de código aberto para Chrome e Edge no Windows. Lê quem você segue na sua própria conta já aberta no TikTok e permite revisar todos ou alguns desses perfis para deixar de seguir. A leitura e as ações pelo site são experimentais; seus dados ficam neste navegador.

## Instalar a extensão pronta

1. Extraia o **ZIP da extensão compilada** para uma pasta que você possa manter no computador.
2. Confira se `manifest.json` aparece diretamente nessa pasta, junto de `manager.html` e dos demais arquivos. Não tente carregar o ZIP sem extrair.
3. Abra `chrome://extensions` no Chrome ou `edge://extensions` no Edge.
4. Ative **Modo do desenvolvedor**.
5. Clique em **Carregar sem compactação** e selecione a pasta que contém `manifest.json`.
6. Clique no ícone do elo TikTok para abrir o gerenciador. Fixe o ícone na barra do navegador se quiser.

Não selecione o ZIP de código-fonte em “Carregar sem compactação”. Depois de atualizar os arquivos da extensão, clique em **Recarregar** na página de extensões e recarregue também a aba do TikTok.

### Atualizar uma instalação 0.1 ou 0.2

Exporte os dados que deseja conservar. Extraia o conteúdo do novo ZIP **sobre a mesma pasta que já está carregada** na instalação anterior. Na página de extensões, clique em **Recarregar**; depois recarregue a aba do TikTok. Confira se a versão exibida é 0.2.2. A permissão `scripting`, presente desde a 0.2.1, permite recolocar o leitor empacotado numa aba aberta que esteja sem comunicação com o elo.

Carregar uma pasta nova pode criar outra identidade de extensão e deixar o histórico anterior inacessível nessa instalação. Para atualizar preservando a instalação existente, mantenha a mesma pasta; não carregue uma segunda cópia. Não desinstale a versão anterior antes de exportar seus dados.

## Ler quem sigo no TikTok

Não é necessário baixar um arquivo oficial para este fluxo.

1. Abra `https://www.tiktok.com/` no mesmo Chrome ou Edge em que a extensão está instalada e entre normalmente na sua conta.
2. Abra o elo e clique em **Ler quem sigo no TikTok**.
3. O elo identifica a sessão pelo link Perfil da navegação, abre seu próprio perfil, aguarda o perfil carregar e abre **Seguindo** pelo contador.
4. Mantenha a aba TikTok visível enquanto o elo percorre o contêiner da lista e acumula os nomes. Aguarde sem clicar nem digitar nessa aba. Acompanhe o progresso no gerenciador; use **Cancelar leitura** para interromper.

Essa etapa só lê e rola a lista: não segue nem deixa de seguir ninguém. A extensão não solicita senha, cookies ou chave de API.

A versão 0.2.2 também lê o popup que mostra o @ da conta como cabeçalho, sem exigir um título “Seguindo”. Nesse caso, a extensão precisa abrir um único popup pelo contador **Seguindo** do próprio perfil. Um popup sem identificação que já estava aberto é recusado. Interagir com a aba, trocar a lista ou mudar de conta interrompe essa leitura; comece novamente e aguarde sem interagir. A captura manual opcional continua exigindo um tipo de lista identificável.

A lista recebe a indicação **Seguindo conferido pelo total** somente quando o contador exato permanece igual antes e depois da leitura e a quantidade de @usuários únicos lidos corresponde ao total, inclusive quando o contador é zero. Contador abreviado, como `1K`, contador ausente, interrupção ou quantidade insuficiente deixam a leitura parcial. O fim da rolagem, sozinho, não comprova que todos foram lidos.

Essa conferência vale **somente para Seguindo**. Ela não lê todos os seguidores e não permite concluir reciprocidade, mútuos ou perdas. O histórico salva a leitura com essa distinção. Para essas análises adicionais, a importação oficial continua disponível como opção.

### Se a sessão ou o perfil não forem reconhecidos

Confira em **Extensões → elo TikTok → Detalhes** se o acesso a `www.tiktok.com` está permitido, recarregue a extensão e a aba TikTok e clique em **Conferir sessão**. Quando falta o receptor da extensão numa aba já aberta, essa conferência pode recolocar o leitor local uma vez e reler o estado. Ela não repete uma ação de deixar de seguir nem recupera automaticamente um lote em andamento.

Reconhecer a conta no menu Perfil e reconhecer o perfil que terminou de carregar são verificações diferentes. A versão 0.2.1 aceita layouts com apelido no título e @usuário no subtítulo, mantendo a exigência de que o identificador corresponda exatamente ao endereço e ao perfil esperado. As mensagens distinguem falha de conexão, conta, endereço, identificador e botão de relacionamento. Se ainda houver erro, a operação permanece interrompida; não é seguro usar só o endereço da página para autorizar um clique.

## Importar dados oficiais — opcional

No aplicativo TikTok, abra **Perfil → ☰ → Configurações e privacidade → Conta → Baixar seus dados**. Solicite informações do perfil e as listas de seguidores/seguindo, preferencialmente em **JSON**. Aguarde o TikTok preparar o pacote, baixe-o e extraia o ZIP. O elo não solicita esse pacote nem baixa dados por você.

No elo, clique em **Importar análise** e escolha o JSON extraído. Para TXT, selecione os arquivos de seguidores, seguindo e perfil juntos, do mesmo pacote e da mesma conta. A extensão não aceita ZIP diretamente. Limites: 80 MB por arquivo e 100 MB no total.

TXT tem suporte estrito a estes nomes de arquivo, sem diferença entre maiúsculas e minúsculas:

| Dados | Nomes aceitos |
| --- | --- |
| Seguidores | `Follower.txt`, `Follower List.txt`, `Followers.txt` |
| Seguindo | `Following.txt`, `Following List.txt` |
| Perfil proprietário | `Profile Info.txt`, `Profile Information.txt` |

Nas listas TXT, cada registro precisa de linhas em inglês `Date: ...` e `Username: ...`/`UserName: ...`, com valores preenchidos. Cabeçalhos, nomes traduzidos, mensagens de lista vazia e outros formatos não são aceitos. Se o seu pacote tiver essas diferenças, solicite JSON; renomear um arquivo não transforma seu conteúdo no formato esperado.

Antes de salvar:

1. Confira o **@usuário proprietário dos dados**. Se não estiver no arquivo de perfil, informe sua própria conta, nunca o nome de um seguidor.
2. Informe a **data de referência em que o pacote foi gerado**, não a data de um follow nem uma data inventada para conseguir importar.
3. Confira se as duas listas estão presentes, válidas e completas no pacote oficial. Só então marque a declaração de completude. Se houver dúvida, salve como parcial. Quando o perfil do pacote traz contagens inteiras exatas, elas também precisam corresponder às listas; divergências impedem marcar completude.

O TikTok informa que algumas categorias podem omitir as últimas 24–48 horas e dados que afetem a privacidade de terceiros. “Completa declarada” descreve sua conferência do pacote; não certifica o estado atual da conta. [Orientações oficiais para baixar dados](https://support.tiktok.com/en/account-and-privacy/personalized-ads-and-data/requesting-your-data).

## Entender listas e histórico

Com duas listas completas, o elo mostra seguidores, seguindo, quem não segue de volta, fãs e mútuos. Use a busca, a seleção e a navegação entre páginas para localizar perfis. O seletor **Análise exibida** permite consultar pacotes anteriores da conta selecionada.

Importe os pacotes em ordem cronológica. A data de referência precisa ser posterior à última análise salva nessa conta; arquivos repetidos, antigos ou fora de ordem são recusados. Para comparar mudanças, o elo usa a última base completa anterior da mesma conta e a nova análise completa. Uma captura parcial não produz conclusões de reciprocidade nem de perdas.

Em **Análises e mudanças**, “ausente na nova lista” indica uma diferença detectada ao importar os arquivos. Não é a data exata em que alguém deixou de seguir. As relações são identificadas pelo @usuário: renomeações, contas removidas e omissões do TikTok podem aparecer como entradas ou saídas.

## Proteger perfis

Clique em **Proteger** ao lado do perfil. A proteção é guardada por conta e impede sua seleção para ações. A lista **Protegidos** reúne esses nomes. A extensão confere as proteções novamente antes de enviar cliques.

## Capturar uma lista já aberta — opcional

Para análise por arquivos, não é necessário entrar no TikTok. Para as leituras pelo site e as ações, o elo usa a página já autenticada do mesmo navegador.

Clique em **Conferir sessão** e confira o @ reconhecido. Para **Capturar listas abertas**, abra seu próprio perfil, abra Seguidores ou Seguindo e carregue as linhas desejadas. A captura lê apenas as linhas já carregadas e é **sempre parcial**: não comprova que a lista terminou, não rola automaticamente e não permite conclusões sobre perdas.

## Deixar de seguir todos ou alguns perfis — experimental

Este recurso depende da interface atual do TikTok e ainda precisa de validação real na sua versão do site. Não há promessa de funcionamento para todas as contas ou idiomas. Nenhuma ação é executada apenas ao importar, conferir sessão ou selecionar perfis.

1. Confira a conta dos dados e a conta conectada; elas precisam ser a mesma.
2. Na seção **Seguindo**, use **Revisar todos que sigo** quando a leitura do site tiver conferência pelo total. Se a leitura for parcial, o botão será **Revisar perfis lidos**: ele inclui somente os nomes encontrados. Para arquivos completos declarados, o botão é **Revisar todos da análise**, que se refere à data daquele pacote.
3. Se preferir escolher alguns nomes, use as caixas de seleção e **Revisar para deixar de seguir**. Protegidos e perfis com tentativa pendente, incerta ou já observada ficam fora. A revisão aceita de **1 a 10.000 perfis**.
4. Confira todos os @usuários da revisão, marque a confirmação e digite o @ da sua própria conta.
5. Confirme dentro de **cinco minutos**. Se a revisão expirar, faça outra revisão.

Depois dessa confirmação, o elo ativa a aba TikTok e **abre o perfil de cada alvo**, um por vez; você não precisa manter todos os alvos carregados no diálogo da lista. Ele aguarda o identificador do perfil e o botão de relacionamento compatível. Mantenha a aba visível e não navegue nem interaja com ela durante a operação.

Antes de cada clique, a extensão confere a conta conectada, o perfil, a análise revisada e os protegidos. O identificador visível do perfil precisa corresponder ao endereço da página. Uma tentativa é registrada localmente antes do primeiro clique. Se o TikTok abrir um diálogo de confirmação, ele precisa identificar explicitamente o **@ do alvo**; caso contrário, o elo interrompe e pede conferência manual.

Use **Cancelar operação** para impedir os próximos cliques. Uma alteração já enviada pode ter ocorrido. Mudança de conta ou página, desafio de segurança, bloqueio ou resposta incerta interrompem o lote. Tentativas enviadas ou incertas não são repetidas pela extensão. Consulte **Histórico de ações** e confira resultados incertos manualmente no TikTok.

O elo envia no máximo uma tentativa de alteração por alvo e faz uma pausa de dois segundos entre perfis concluídos. Essa pausa não garante uma cota permitida ou ausência de bloqueios do TikTok.

“Interface confirmou” significa que o botão permaneceu em Seguir durante quatro observações consecutivas (aproximadamente um segundo) na página. Não é confirmação independente do servidor. O elo não contorna bloqueios, não resolve CAPTCHA e não retoma um lote após reinício do serviço da extensão.

**Remover seguidores está indisponível.** Não foi confirmado um método verificável no TikTok web; a função não é substituída por bloquear/desbloquear. O TikTok documenta a remoção manual no aplicativo. [Ajuda oficial](https://support.tiktok.com/en/using-tiktok/followers-and-following/removing-followers).

## Exportar e manter cópias

- **CSV:** exporta os perfis da análise exibida, com datas, presença nas listas e proteção atual. As colunas de completude geral e `seguindo_completo` distinguem as evidências. Em análise parcial, ausência em uma lista não comprova que a relação não existe.
- **JSON:** exporta o histórico local da conta selecionada, análises, mudanças, protegidos e ações. Guarde o arquivo em local privado.
- **Reimportar JSON do elo:** importa somente a análise mais recente, com nova conferência da conta, data e completude. Proteções, histórico e diário de ações **não são restaurados**. Uma análise exportada como parcial permanece parcial, e a conferência de Seguindo feita no site não é reaplicada como prova ao reimportar. Esse fluxo não é uma restauração completa de backup.

O armazenamento é um IndexedDB próprio, separado do elo Instagram e de outros perfis do navegador. **Desinstalar a extensão, limpar seus dados ou perder esse perfil pode apagar o histórico.** Os arquivos exportados no computador permanecem sob seu controle. Veja [PRIVACIDADE.md](PRIVACIDADE.md) e [docs/LIMITACOES.md](docs/LIMITACOES.md).

## Executar o código-fonte

Na pasta do código-fonte, com Node.js compatível com as dependências (22.12 ou superior) e npm:

```text
npm ci
npm run check
$env:ELO_CHROME_EXECUTABLE = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:ui
npm run test:connection
```

`check` verifica os tipos, executa os testes automatizados e compila a extensão em `.output/chrome-mv3`. Para carregar esse build local, selecione essa pasta em “Carregar sem compactação”. `test:ui` verifica a interface e `test:connection` verifica cenários locais de conexão e identificação de perfil, sem usar sua conta TikTok. A disponibilidade do navegador exigido pelos testes deve ser conferida no ambiente de desenvolvimento.

Consulte [docs/VALIDACAO.md](docs/VALIDACAO.md) para o registro da validação desta entrega. Testes e páginas artificiais não certificam a integração no site real.

## Código aberto e fontes

Licença MIT. Componentes apropriados do elo Instagram 0.1.1 / IgDiff foram reaproveitados com os avisos preservados. A integração TikTok foi desenvolvida separadamente. Veja [LICENSE](LICENSE), [NOTICE.md](NOTICE.md), [THIRD-PARTY-NOTICES.txt](public/THIRD-PARTY-NOTICES.txt) e [pesquisa técnica](docs/PESQUISA.md).

Projeto independente, sem vínculo com TikTok ou ByteDance. Android está fora desta etapa.
