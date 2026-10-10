# Verificação do Jarvis

Data: 9 de outubro de 2026. Plataforma: Windows 11.

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
