# Verificação do Jarvis

## RAG semântico local e busca híbrida no cofre — 12 de outubro de 2026

Implementado motor de RAG semântico leve e local em `semantic_rag.py`, sem dependências externas obrigatórias (compatível com Python 3.11+ puro).
A indexação combina n-grams de subpalavras para variações morfológicas, expansão bidirecional de conceitos semânticos (sinônimos técnicos em português para voz, memória, tarefas, performance e IA), extração estruturada de metadados do Obsidian (tags YAML no frontmatter, tags inline `#tag`, cabeçalhos `#` e wikilinks `[[...]]`) e espaço vetorial com similaridade de cosseno.

O `SemanticIndex` armazena atomicamente o índice em `semantic_index.json` utilizando o hash SHA-256 da revisão de cada nota, reindexando de forma incremental apenas arquivos novos ou alterados. A busca híbrida (`mode='hybrid'`) equilibra precisão léxica e recall semântico. A extração semântica de trechos preserva estritamente as coordenadas exatas de caracteres (`inicio`, `fim`) e linhas originais para auditoria e citação, inclusive após 20.000 caracteres.

Passaram 105 testes Windows (incluindo 5 novos testes de RAG semântico em `tests/test_semantic_rag.py`) e 91 testes Cloud Node.js. JavaScript validado com `node --check`.

## Correção da voz local e conexão — 11 de outubro de 2026

Reproduzida a falha de decodificação: faster-whisper 1.2.1 chama `av.open` com `metadata_errors`, removido pelo PyAV 19.0.1 instalado. A instalação local foi corrigida para PyAV 18.1.0 e `requirements-voice.txt` restringe `av>=11,<19`. O modelo base já estava em cache; o teste não baixou outro modelo nem utilizou áudio pessoal. WAV sintético passou pelo endpoint real com HTTP 200, e o health-check continuou 200 depois da transcrição. Isso valida decodificação e execução com silêncio sintético, não reconhecimento de fala pelo microfone real.

O servidor estava ausente na porta 8765 na primeira consulta. Uma instância posterior iniciada com Python global não encontrou bibliotecas de voz; a instância no `.venv` validado respondeu corretamente após reinicialização sem pedidos ativos, preservando a mesma pasta de dados. A falha de decodificação foi tratável e não demonstrou, sozinha, a causa de o servidor original ter parado.

Áudio inválido/incompleto agora recebe 400 antes de carregar bibliotecas. Falhas de importação, modelo e decodificação recebem 503 com orientação, sem expor detalhes privados; testes confirmam continuidade de estado e chat e limpeza dos temporários. O painel explica falhas de conexão local sem reenviar pedidos. `INICIAR.bat` prioriza o executável absoluto do `.venv`, informa que fechar sua janela encerra o servidor e mostra o código de saída. Passaram 100 testes Windows, 91 online e build.

## Organização 0.7 e segundo cérebro — 11 de outubro de 2026

Implementadas as oito melhorias: conversas por assunto, cópia de código/respostas, tarefas com prazo/prioridade/projeto, notas com etiquetas/pastas/prévia, painel Windows, contexto selecionável, PWA/rascunhos e sincronização manual de notas escolhidas. A sincronização conserva versões e backups, recusa conflitos sem resolução explícita e trata a revisão remota como identificador opaco. O contexto da IA continua separado do cofre local.

Passaram 91 testes online e build, 91 testes Windows (incluindo 19 sintéticos da sincronização) e a verificação adicional dos cinco testes do servidor após incluir os novos assets na whitelist. A migração `jarvis_cloud_v3_conversations_memory` foi aplicada; `verify-features.sql` passou no Supabase real com rollback. Antes e depois: uma nota, uma tarefa, duas mensagens e dois pedidos; nenhum registro sem conversa após a migração. Não houve envio de notas pessoais pela sincronização.

Criados 14 guias Markdown conectados, compatíveis com Obsidian, e ajuda HTML pública com navegação e escape de HTML. Os testes conferem links internos e ausência de execução de HTML. Deploy de produção dpl_DfSUG7QYE3YruuT6471penEwaVRG para 12d0686 ficou READY; o health-check confirmou 0.7.0 e os dois jobs do CI 38247419282 passaram. A ajuda pública e sua navegação foram conferidas no navegador interno. A API autenticada confirmou conversas, detalhes de tarefas, metadados e sincronização de nota sintética (seleção, envio, download, backups, conflito e resolução). Permaneceram um novo registro de conversa, uma nota sintética e uma tarefa concluída identificados como Validação 0.7; as mensagens e pedidos anteriores não mudaram. Instalação no celular real, interface autenticada no Chrome, uso habitual da sincronização no Obsidian e próximo logon real do Windows permanecem pendentes. A resposta autenticada anterior está registrada abaixo.

## Legibilidade e atualização do painel — 11 de outubro de 2026

Respostas de IA usam elementos DOM seguros para títulos, listas, negrito, ênfase e código; HTML, links e imagens não são ativados. Guardar a resposta preserva o Markdown original. A aba online consulta a disponibilidade do Windows a cada trinta segundos sem pendências e a cada cinco segundos com pedidos pendentes. A recuperação remove somente o aviso de polling; uma consulta da sessão anterior não altera avisos ou timers após sair e entrar novamente.

Passaram 75 testes online, incluindo seis de Markdown e três regressões de polling, e o build. Passaram 72 testes Windows fora do sandbox, pois os testes HTTP locais falharam com as restrições de rede do sandbox. O Chrome autenticado não está conectado nesta sessão e a prévia localhost também ficou inacessível no navegador interno; portanto, a nova formatação ainda requer confirmação visual na interface. A resposta autenticada registrada na seção seguinte foi validada antes desta mudança.

## Fila autenticada e retomada do componente — 11 de outubro de 2026

A conta foi conectada pelo usuário no console; um dispositivo revogável está registrado e a sessão permanece protegida com DPAPI. O startup-check real confirmou o protocolo do CLI e o gate online, sem buscar pedidos. O worker iniciou em segundo plano e concluiu o pedido de exercícios JavaScript que já estava aguardando com Windows offline: início e conclusão gravados, duas mensagens persistidas e um pedido concluído, sem duplicação.

A leitura autenticada de `/api/state` pelo componente confirmou disponibilidade, uma nota, uma tarefa, duas mensagens e dois pedidos (um cancelado histórico). Pausa e retomada reais preservaram essas contagens. A tarefa `JarvisWorker` foi registrada e iniciada com logon `Interactive`, execução `Limited` e janela oculta; o heartbeat após a retomada confirmou `ready`. Corrigida a descoberta do Python no instalador: selecionar apenas o primeiro executável, evitando concatenar os caminhos do Python instalado e do alias WindowsApps. Os 21 testes do componente passaram após essa correção.

Após novo login realizado pelo usuário, a resposta com os exercícios JavaScript foi confirmada visualmente no Chrome, junto do estado “Windows conectado”. Ao recarregar, a sessão, a resposta, a nota e a tarefa permaneceram disponíveis. Um aviso transitório de atualização da fila deixou de aparecer após a recarga; a causa desse aviso e do erro da sessão anterior não foi determinada. A leitura autenticada pelo worker e a chamada dos RPCs com a identidade da conta também foram aprovadas.

O próximo logon real do Windows ainda precisa ser observado; iniciar a tarefa manualmente não comprova esse evento. O contexto preparado para o worker contém apenas dados online; ferramentas nativas continuam sujeitas às permissões do CLI, sem garantia de sandbox de arquivos.

Atualização: 10 de outubro de 2026. Plataforma: Windows 11.

## Diagnóstico da conexão do worker — 11 de outubro de 2026

A configuração pública, URL e formato da chave pública, o transporte HTTPS usado pelo worker e a proteção DPAPI passaram em verificação real com dados sintéticos. O endpoint público confirmou Antigravity habilitado e Windows offline. O console agora identifica falhas ao consultar configuração, entrar na conta Jarvis, registrar o dispositivo e salvar a conexão protegida, incluindo o status HTTP quando disponível. Não exibe resposta privada do provedor nem senha ou tokens. Esses testes não comprovam o login do usuário: a mensagem da tentativa que falhou ainda precisa ser informada.

## Política atual — ferramentas do CLI autorizadas pelo proprietário

Resposta direta autenticada real aprovada: pedido sintético solicitando somente “Conexão Antigravity OK.”, em workspace temporário, sem inclusão de notas ou tarefas. O teste concluiu com essa resposta. A fila autenticada e a retomada após reinício ainda não foram validadas; nenhuma credencial Supabase do worker foi configurada nesta etapa.

Removidos o bloqueio por inventário não vazio e a rejeição de eventos de ferramenta. O probe real 1.3.3 passou com 60 ferramentas, sem enviar pedido. Passaram 70 testes Windows, incluindo aceitação do inventário e eventos, recusa de protocolo inválido, START antes do envio, isolamento de variáveis de credenciais, cancelamento e encerramento de processos. Essa validação não demonstra confinamento de ferramentas nativas nem descoberta efetiva do perfil. Os registros abaixo são históricos da política anterior.

## Worker Windows — preparado, execução bloqueada pela CLI real

| Verificação | Resultado |
| --- | --- |
| Versão oficial atual | Manifest Windows `windows_amd64` consultado no instalador oficial: Antigravity 1.3.3 |
| Download privado | SHA-512 conferido; versão anterior preservada; sem alterar PATH, aliases ou configurações globais |
| Probe real 1.3.3 | `init.agent = jarvis-chat`, `tool_count = 60`, `prompt_sent = false`, `before_send_called = false`; gate manteve a recusa |
| Transporte e worker | 20 testes de transporte e 18 do worker com processos/modelo/HTTPS simulados; incluem prova DPAPI real com dados sintéticos e mutex Windows exclusivo |
| Proteções verificadas | Probe antes de claim; START confirmado antes do stdin; replay de START recusado; cancelamento e Job Object; ambiente da CLI sem credenciais do worker; redirects recusados |
| Recuperação | Resultado criptografado com DPAPI antes da publicação; retry somente da conclusão com a mesma resposta; tentativa expirada/incerta preservada para revisão, sem regeneração automática |
| Conta e ativação reais | Nenhuma credencial de usuário inserida nesta etapa; nenhum pedido real processado, tarefa agendada ou autostart instalado |

Dados do worker: `%LOCALAPPDATA%/JarvisGemini/worker`, fora do repositório e do cofre local. `CONFIGURAR-WORKER.bat` oferece conexão Supabase por senha oculta, probe, pausa, retomada manual, revogação, estado local e instalação/desativação da inicialização ao logon. `INICIAR-WORKER.bat` executa manualmente; a CLI precisa comprovar `tools: []` antes de buscar qualquer pedido. Login Google permanece no keyring próprio do Antigravity, separado da sessão Supabase protegida por DPAPI.

`INICIALIZACAO-WORKER.ps1` prepara uma tarefa de logon do usuário interativo, com privilégios limitados e `pythonw.exe` absoluto, sem senha ou tokens nos argumentos. A instalação exige probe estrito e gate online positivo antes de registrar a tarefa. O script não inicia o worker na instalação. Nesta entrega, nenhuma tarefa foi registrada e esse caminho continuará recusado enquanto a CLI anunciar ferramentas.

O worker foi preparado para polling de 10s, heartbeat de 30s, geração de até 180s e renovação de lease de 240s. Estes contratos ainda precisam de validação autenticada ponta a ponta com o backend da fila. A CLI 1.3.3 continua bloqueada: encontrar o binário, fazer login ou instalar a fila não comprova controle de ferramentas. Gates administrativos online devem continuar desativados. A assinatura Antigravity possui cotas; esta implementação não promete acesso ilimitado nem usa fallback pago silencioso.

Workspaces temporários contêm o perfil protegido. A CLI pode manter transcrições globais; remover o workspace não garante apagar esses registros. Resultados de tentativas rejeitadas/expiradas permanecem em um outbox DPAPI terminal para revisão e interrompem novos claims até resolução explícita.

A investigação adicional e a contraprova com agente inexistente estão em [DIAGNOSTICO-ANTIGRAVITY.md](DIAGNOSTICO-ANTIGRAVITY.md). O nome em `init.agent` sozinho não comprova que o perfil foi carregado. A suíte Windows completa passou em 68 testes. O transporte também descarta respostas quando há eventos de ferramenta ou etapas inválidas, inclusive após sucesso; essa proteção posterior não comprova que uma ação nunca ocorreu. O gate anterior ao envio permanece obrigatório e o processamento continua desativado.

Os registros 0.4.0 e anteriores abaixo são históricos e não validam o novo worker ou a entrega online.

## Prévia 0.4.0 — checks locais aprovados, migração não concluída

| Verificação | Resultado |
| --- | --- |
| CLI nativo local | Antigravity 1.3.2 em `.tools/antigravity/agy.exe`; SHA-512 verificado |
| Instalação | Local, sem alteração de PATH, aliases ou configurações globais; sem SDK/API key |
| Perfil e ferramentas no CLI real | `init.agent` confirmou `jarvis-chat`, mas `init.tools` anunciou cerca de 59 ferramentas apesar de `tools: []`; gate bloqueou sem enviar prompt |
| Autenticação e conversa Antigravity | Pendentes; login sozinho não corrige o bloqueio das ferramentas |
| Suíte de testes 0.4.0 | 42 passaram em 10,323 s com Python 3.14.5 no Windows |
| JavaScript e sintaxe Python 0.4.0 | `node --check` em app.js/workspace.js e `py_compile` aprovados |
| Instalação nova | PowerShell: download e verificação SHA-512 aprovados; execução com CLI existente também aprovada |
| Build Windows 0.4.0 | PyInstaller 6.22.3 com Python 3.12.14 concluído |
| Executável real 0.4.0 | Health, assets, busca, edição, histórico, restauração, tarefas e backup aprovados via HTTP |
| Gate no executável com CLI real | Recusa HTTP 400 com causa explícita; pedido não enviado e histórico de conversa vazio |
| Reinício com dados existentes | Servidor 0.4.0 ativo; 16 arquivos de notas, histórico e estado preservados byte a byte |
| Microfone/Whisper e leitura SAPI reais | Pendentes de validação pelo usuário |

O objetivo da integração é conversa somente texto, mas essa condição não foi confirmada no Antigravity 1.3.2 real. A lista recebida inclui `run_command`, `view_file`, `search_web`, navegador, MCP e envio de mensagens. O bloqueio antes de transmitir pedido/notas funcionou no probe real; a conversa permanece indisponível enquanto a restrição não for demonstrada. Nenhuma política efetiva foi demonstrada nesta etapa. Login continua pendente e não resolve sozinho essa divergência. Um probe anterior sem dados pessoais retornou `authentication required` antes de `init`, sem pedido enviado.

O último probe com allowlist também anunciou as ferramentas. Não foi demonstrado controle efetivo por processo; o envio permanece bloqueado. Mocks verificam a lógica do runtime; build e smoke HTTP verificam a aplicação local. Esses resultados não demonstram segurança do CLI autenticado nem resposta real. O registro 0.3.0 abaixo é histórico.

Esta etapa é uma prévia local para revisão. O próximo gate exige isolamento/controle efetivo das ferramentas ou escolha do usuário por API de texto com chave, sujeita a regras próprias de quota/cobrança, com Free Tier elegível ou tiers pagos. A assinatura Google AI Pro não é a quota de API programática; nenhuma API foi configurada. Pacotes da prévia: `Jarvis-Gemini-0.4-Previa-Codigo.zip` e `Jarvis-Gemini-0.4-Previa-Windows.zip`, com hashes em `SHA256SUMS.txt`; nenhuma publicação externa.

## Versão 0.3.0 — validação local

| Verificação | Resultado |
| --- | --- |
| Testes automatizados do serviço | 32 passaram em 4,744 s com Python 3.14.5 no Windows, sem `ResourceWarning` |
| Evidências no meio/fim de notas longas | Regressões aprovadas, incluindo evidência após 20.000 caracteres e captura do prompt enviado ao CLI pela API |
| Orçamento total de contexto e histórico | Regressões aprovadas; teto de 32.000 caracteres inclui instruções, JSON serializado e pedido |
| CLI: formato, timeout, erro e resposta vazia | Regressões aprovadas, incluindo falha de inicialização por `OSError` |
| Concorrência e liberação dos locks | Regressões aprovadas; pedidos seguintes funcionam após falhas |
| JavaScript | `node --check` em app.js e workspace.js aprovado nesta entrega |
| Sintaxe Python | `py_compile` aprovado nesta entrega |
| Build Windows desta entrega | PyInstaller 6.22.3 com Python 3.12.14 concluído |
| Executável real 0.3.0 | Health, assets, busca, edição, histórico, restauração, tarefas e backup aprovados por HTTP com dados descartáveis |
| Conversa autenticada Gemini e voz real | Pendentes de validação pelo usuário |

O teste do executável não usou Gemini nem login. Não houve nova jornada no Chrome nesta rodada, nem validação de instalação em outro PC. Os resultados da versão 0.2 abaixo são registros anteriores.

### Limites do contexto 0.3.0

- Prompt completo de até 32.000 caracteres, medido após serializar o JSON; o pedido aceito de até 12.000 caracteres permanece intacto.
- Até seis notas, com até três trechos de 1.000 caracteres por nota, arquivo, posições e linhas de origem.
- Até cinquenta tarefas, com até 300 caracteres do texto de cada uma.
- Até dez mensagens recentes, com até os 2.000 caracteres finais de cada mensagem.
- Prioridade: notas, tarefas e histórico; os componentes cedem espaço para respeitar o limite total. A seleção não modifica os dados persistidos.

## Registro da versão 0.2

| Verificação | Resultado |
| --- | --- |
| Testes automatizados do serviço | 13 passaram com Python 3.14 |
| JavaScript | `node --check` em app.js e workspace.js |
| CLI instalado | Gemini CLI 0.63.0, Node.js 24.16.0 |
| Compatibilidade | `--output-format` e `--admin-policy` confirmados pelo CLI real |
| Chrome | Criar e editar nota, consultar histórico, restaurar versão e criar backup |
| Build Windows | PyInstaller 6.22.3 com Python 3.12.14 |
| Executável | Inicialização, assets, notas, histórico, restauração e backup validados por HTTP |

## Limites da verificação

A conversa Antigravity está bloqueada porque o CLI real anuncia ferramentas que o Jarvis não autoriza. Esse bloqueio precisa ser resolvido e a restrição verificada; o novo login é uma pendência separada. Respostas do modelo nos testes são simuladas. A autenticação anterior do Gemini não valida o novo provedor. Microfone/Whisper e reprodução SAPI ainda precisam de teste pelo usuário. O executável padrão inclui texto e leitura SAPI; não incorpora o modelo de transcrição.

## Mudanças da primeira versão recuperada

Restaurados dois trechos de código ocultados automaticamente no histórico. Corrigidos escapes de novas linhas ao recuperar o código. Atualizada a resolução do pacote Gemini no Windows para usar sua entrada declarada em `package.json`, incluindo instalação local. Implementados diagnóstico, edição com detecção de conflito, histórico/restauração, backup, importação não destrutiva dos guias e indicação de contexto.

Arquivos de dados e login Google não são incluídos nos ZIPs de distribuição.
