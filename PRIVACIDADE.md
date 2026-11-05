# Privacidade — elo TikTok 0.2.1

O elo TikTok processa os dados das listas da sua própria conta e, opcionalmente, os arquivos escolhidos por você. Não há cadastro no elo, servidor próprio, telemetria, publicidade ou envio dos arquivos importados para um serviço externo. A função Ler quem sigo usa sua sessão TikTok já aberta e não exige um arquivo oficial.

## Dados guardados

O IndexedDB próprio da extensão, chamado `elo-tiktok`, guarda separadamente por @usuário:

- Listas importadas ou capturadas, com nomes de usuário e nomes de exibição quando disponíveis.
- Datas de referência, importação e detecção; origem e declaração de completude das análises.
- Indicação separada de conferência da lista Seguindo, com a quantidade exata observada quando disponível; isso não declara completude dos seguidores.
- Identificadores de análise e resumos criptográficos para reconhecer importações repetidas.
- Perfis protegidos, mudanças entre análises e histórico das tentativas de ação.

O arquivo oficial pode conter mensagens, telefone, e-mail ou outros dados pessoais. A extensão procura somente os campos de perfil proprietário e listas que seu importador reconhece; os demais campos não são incluídos nas análises guardadas. Durante a leitura, o conteúdo selecionado passa pela memória local do gerenciador.

O elo não pede, exporta ou armazena senha, cookies de sessão, tokens TikTok ou chave de API. A importação local funciona sem uma sessão TikTok aberta.

## Quando o TikTok é acessado

Ao clicar em Abrir TikTok ou em um perfil, seu navegador visita o TikTok, sujeito às regras e à política do próprio serviço. Para as leituras e o recurso experimental de deixar de seguir, a extensão lê elementos da página autenticada em `https://www.tiktok.com/`.

Ler quem sigo abre seu próprio perfil, clica no contador Seguindo e percorre o contêiner da lista. Depois de uma revisão e confirmação de ações, o elo abre os perfis dos alvos um por vez. Essas navegações e os carregamentos normais da página são visíveis ao TikTok e usam sua sessão existente. A leitura não executa ações de relacionamento.

Quando uma conferência de sessão encontra uma aba sem o receptor da extensão, o elo pode recolocar uma vez seu próprio leitor empacotado na página e reler o estado. Essa recuperação usa o contexto isolado da extensão; não baixa código remoto, não acessa cookies e não repete solicitações de alteração de relacionamento. Durante uma coleta ou lote ativo, não há recuperação automática por reinjeção.

Se você revisar e confirmar uma ação, a extensão pode clicar nos controles de relacionamento da página. O próprio site TikTok envia as solicitações correspondentes usando sua sessão normal. O elo não utiliza um servidor intermediário nem inventa endpoints internos. Conferir a sessão, importar arquivos e selecionar perfis não iniciam uma ação de deixar de seguir.

## Permissões

- Acesso a `https://www.tiktok.com/*`: permite o adaptador da página, a leitura explícita de listas e os cliques autorizados.
- `scripting`: permite recolocar o leitor que acompanha a extensão em uma aba TikTok aberta quando falta comunicação, apenas para recuperar a leitura de estado. Não concede acesso a outros sites fora das permissões de domínio.
- `unlimitedStorage`: permite o armazenamento local da extensão e reduz o risco de restrições de espaço ao guardar histórico. Não é garantia contra perda de dados do computador ou do perfil do navegador.

## Exportação e remoção

JSON e CSV são gravados apenas quando você solicita. Esses arquivos contêm nomes e relacionamentos pessoais; escolha onde guardá-los e com quem compartilhá-los. A exportação JSON inclui protegidos e histórico de ações, mas a reimportação atual recupera somente a análise mais recente.

Não há sincronização entre navegadores, máquinas ou perfis Chrome/Edge. O elo TikTok usa armazenamento separado do elo Instagram. Desinstalar a extensão ou limpar seus dados do navegador remove o armazenamento local e pode apagar todo o histórico. Faça as exportações desejadas antes disso. A desinstalação não apaga os arquivos JSON/CSV já baixados por você.

## Fontes

Os formatos e limites da exportação pertencem ao TikTok. Consulte [baixar seus dados](https://support.tiktok.com/en/account-and-privacy/personalized-ads-and-data/requesting-your-data), [tipos de dados oficiais](https://developers.tiktok.com/docs/en/data-portability-data-types), [API scripting do Chrome](https://developer.chrome.com/docs/extensions/reference/api/scripting), [NOTICE.md](NOTICE.md) e a pesquisa em `docs/PESQUISA.md` no código-fonte.
