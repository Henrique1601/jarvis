# Equipe e condução do Jarvis

Configurado a pedido do usuário em 9 de outubro de 2026. Orientação persistente: [AGENTS.md](AGENTS.md).

## Agentes identificados

As definições principais estão em `C:/Users/henri/.agents/skills/custom-agents/`, em pastas com `SKILL.md`. Também existem definições Markdown em `C:/Users/henri/.agents/custom-agents/` e cópias em `C:/Users/henri/.agents/skills/custom-agents/`.

| Perfil | Responsabilidade no Jarvis |
| --- | --- |
| `global-master-agent` | Coordenação principal e escolha dos especialistas |
| `skills-orchestrator` | Fase do projeto, prioridades e critérios de aceite |
| `git-master-agent` | Checkpoint, versionamento e documentação |
| `ai-engineer-agent` | Antigravity, recuperação de contexto, memória e futuras ferramentas |
| `qa-testing-agent` | Testes, regressões e validação das jornadas |
| `design-engineer-agent` | Interface e acessibilidade, conforme a demanda |
| `security-auditor-agent` | Revisão das permissões e integrações, conforme a demanda |

O agente principal leu e aplicou as definições de Supremo, orquestrador e Git. Três subagentes aplicaram os perfis de orquestração/Git, IA e QA em revisões com escopo de leitura. A equipe conduziu a 0.3.0 e agora trabalha na migração 0.4.0 com responsabilidades separadas entre runtime, regressões e documentação. As definições orientam o desenvolvimento; o perfil restrito `jarvis-chat` do Antigravity não é um carregador dos perfis Supremo no aplicativo.

## Diagnóstico inicial da equipe

Arquétipo: sistema de IA para uso local no Windows. Etapa principal: **Fase 6 — testes e validação**, com versão 0.2 implementada e empacotada.

- QA confirmou 13 testes passando com Python 3.14. A execução precisou de acesso ao loopback, bloqueado pelo sandbox na primeira tentativa. A suíte usa Gemini simulado e não mede cobertura.
- Na revisão inicial, o teste Gemini real encontrou saída 41 por autenticação e a resposta autenticada não foi validada. Esse registro é anterior à migração Antigravity.
- Microfone/Whisper e reprodução SAPI continuam pendentes de validação pelo usuário.
- Na revisão inicial, o Git estava inicializado, sem commits e sem remoto. Antes dessa configuração foi criado e verificado um snapshot dos 31 arquivos-fonte não ignorados em `.recovery/checkpoints/`. Dados de uso possuem backup próprio em `jarvis-gemini/data/backups/`.

## Entrega 0.3.0 validada localmente

Antes desta implementação, o agente principal validou um novo checkpoint ZIP de 33 arquivos-fonte. A rodada final aprovou 32 testes em 4,744 s com Python 3.14.5 no Windows, sem `ResourceWarning`, além de JavaScript e sintaxe Python. O build com PyInstaller 6.22.3 e Python 3.12.14 concluiu; o executável real 0.3.0 passou por health, assets, busca, edição, histórico, restauração, tarefas e backup via HTTP com dados descartáveis, sem Gemini/login. Não houve nova jornada Chrome nesta rodada. Resultados: [VALIDACAO.md](jarvis-gemini/VALIDACAO.md). Os números da versão 0.2 acima pertencem ao diagnóstico anterior.

A entrega foi registrada no primeiro commit local `06b6c9d`, com 35 arquivos-fonte e guias selecionados e auditados. O contexto pessoal `CONVERSA-JARVIS.md`, dados de uso, login, backups, dependências e binários ficaram fora desse commit. Não há remoto configurado nem push nesta entrega.

Os ZIPs `Jarvis-Gemini-0.3-Codigo.zip` e `Jarvis-Gemini-0.3-Windows.zip` foram gerados e conferidos, incluindo os guias finais e os hashes de `SHA256SUMS.txt`. O painel local foi reiniciado na versão 0.3.0 usando a mesma pasta de dados, após criar e verificar um backup das notas, tarefas e histórico.

O código-fonte limita o prompt completo a 32.000 caracteres, incluindo instruções, JSON serializado e pedido. Preserva pedidos aceitos de até 12.000 caracteres e prioriza notas, tarefas e histórico. Os limites por componente e a seleção de trechos com posições/linhas estão documentados no [guia 0.3.0](jarvis-gemini/vault/wiki/jarvis-versao-0.3.md).

## Critérios concluídos na 0.3.0

1. **Recuperação de trechos.** A versão 0.2 pontuava a nota completa, mas enviava apenas seus primeiros 3.000 caracteres e conservava até 20.000 na busca. As regressões da 0.3 demonstram evidência no meio/fim, inclusive depois de 20.000 caracteres, no contexto com origem verificável.
2. **Orçamento total.** As regressões verificam preservação do pedido e limite do prompt completo, com seleção previsível do histórico e sem reduzir os dados salvos.
3. **Falhas e concorrência.** As regressões cobrem timeout, JSON/formato inválido, erro, resposta vazia, inicialização do CLI e liberação dos locks. Falhas não bloqueiam pedidos seguintes.

## Prévia 0.4.0 — migração não concluída

O usuário autorizou a migração ao Antigravity. Antes das mudanças, o agente principal verificou um checkpoint ZIP de 36 arquivos-fonte e preparou a branch `codex/jarvis-antigravity`. O Antigravity CLI nativo 1.3.2 foi instalado em `.tools/antigravity/agy.exe` com SHA-512 verificado, sem SDK/API key nem mudanças em PATH, aliases ou configurações globais.

O Google encerrou o login individual do Gemini CLI em 18 de junho de 2026; a [orientação oficial](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals) é migrar para Antigravity. O novo login será feito pelo usuário no navegador aberto pelo CLI, sem credenciais em chat.

A prévia mantém o contexto de 32.000 caracteres e os recursos de memória da 0.3.0. O runtime usa perfil `jarvis-chat`, `tools: []` e comandos desativados, exigindo confirmação de `init.agent` e `init.tools` vazio antes de enviar pedido/notas. No CLI real 1.3.2, o nome foi confirmado, mas cerca de 59 ferramentas foram anunciadas, incluindo comandos, arquivos, web, navegador, MCP e mensagens. A tentativa final com allowlist também manteve as ferramentas. O gate bloqueou sem enviar o prompt. A migração não foi concluída e login sozinho não resolve esse bloqueio.

Os 42 testes passaram em 10,323 s com Python 3.14.5 no Windows; JavaScript e sintaxe Python passaram. O instalador PowerShell passou com CLI existente e em instalação nova com download/SHA-512. Build PyInstaller 6.22.3/Python 3.12.14 e smoke HTTP do executável real 0.4.0 passaram em health, assets, busca, edição, histórico, restauração, tarefas e backup. Os mocks e checks locais não demonstram segurança do CLI autenticado; autenticação, resposta real, Whisper e SAPI continuam pendentes.

Os pacotes desta etapa recebem nomes de prévia: `Jarvis-Gemini-0.4-Previa-Codigo.zip` e `Jarvis-Gemini-0.4-Previa-Windows.zip`, com hashes em `SHA256SUMS.txt`. A geração final será registrada separadamente dos checks.

Os scripts, UI e empacotamento ficam sob coordenação principal; IA conduz `antigravity_runtime.py`; QA conduz testes; orquestrador mantém os guias. Dados pessoais, runtime e login são preservados. Não há publicação externa nesta entrega.

## Próximas prioridades

1. **Escolher e validar controle efetivo do provedor.** Critério: demonstrar isolamento/controle efetivo das ferramentas no CLI real ou implementar uma API de texto com chave e acesso/cobrança próprios, após escolha do usuário. A API programática é separada da assinatura Google AI Pro. Só depois habilitar conversa e observar resposta com nota e áudio. Login sozinho, mocks e smoke local não resolvem o bloqueio.
2. **Especificar perfis e ações no aplicativo.** Após consolidar a base, definir catálogo explícito, instruções confiáveis, ferramentas permitidas e registro de execução. Critério: as ações anunciadas são executadas e persistidas pelo serviço.

Esta prévia preserva a implementação para revisão e mantém a conversa bloqueada antes de enviar dados; não conclui a migração. Integração dos perfis Supremo e novas ferramentas continua sendo etapa futura. Detalhes: [README](jarvis-gemini/README.md), [guia 0.4.0](jarvis-gemini/vault/wiki/jarvis-versao-0.4.md) e [validação](jarvis-gemini/VALIDACAO.md).
