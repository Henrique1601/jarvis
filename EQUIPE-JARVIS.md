# Equipe e condução do Jarvis

Configurado a pedido do usuário em 9 de outubro de 2026. Orientação persistente: [AGENTS.md](AGENTS.md).

## Agentes identificados

As definições principais estão em `C:/Users/henri/.agents/skills/custom-agents/`, em pastas com `SKILL.md`. Também existem definições Markdown em `C:/Users/henri/.agents/custom-agents/` e cópias em `C:/Users/henri/.agents/skills/custom-agents/`.

| Perfil | Responsabilidade no Jarvis |
| --- | --- |
| `global-master-agent` | Coordenação principal e escolha dos especialistas |
| `skills-orchestrator` | Fase do projeto, prioridades e critérios de aceite |
| `git-master-agent` | Checkpoint, versionamento e documentação |
| `ai-engineer-agent` | Gemini, recuperação de contexto, memória e futuras ferramentas |
| `qa-testing-agent` | Testes, regressões e validação das jornadas |
| `design-engineer-agent` | Interface e acessibilidade, conforme a demanda |
| `security-auditor-agent` | Revisão das permissões e integrações, conforme a demanda |

O agente principal leu e aplicou as definições de Supremo, orquestrador e Git. Três subagentes aplicaram os perfis de orquestração/Git, IA e QA em revisões com escopo de leitura. A equipe passou a conduzir a entrega 0.3.0 com responsabilidades separadas entre código, regressões e documentação. As definições orientam o desenvolvimento; o Jarvis ainda não possui um carregador desses perfis em sua execução.

## Diagnóstico inicial da equipe

Arquétipo: sistema de IA para uso local no Windows. Etapa principal: **Fase 6 — testes e validação**, com versão 0.2 implementada e empacotada.

- QA confirmou 13 testes passando com Python 3.14. A execução precisou de acesso ao loopback, bloqueado pelo sandbox na primeira tentativa. A suíte usa Gemini simulado e não mede cobertura.
- Gemini real aguarda autenticação Google; o teste anterior encontrou saída 41 por autenticação.
- Microfone/Whisper e reprodução SAPI continuam pendentes de validação pelo usuário.
- Na revisão inicial, o Git estava inicializado, sem commits e sem remoto. Antes dessa configuração foi criado e verificado um snapshot dos 31 arquivos-fonte não ignorados em `.recovery/checkpoints/`. Dados de uso possuem backup próprio em `jarvis-gemini/data/backups/`.

## Entrega 0.3.0 validada localmente

Antes desta implementação, o agente principal validou um novo checkpoint ZIP de 33 arquivos-fonte. A rodada final aprovou 32 testes em 4,744 s com Python 3.14.5 no Windows, sem `ResourceWarning`, além de JavaScript e sintaxe Python. O build com PyInstaller 6.22.3 e Python 3.12.14 concluiu; o executável real 0.3.0 passou por health, assets, busca, edição, histórico, restauração, tarefas e backup via HTTP com dados descartáveis, sem Gemini/login. Não houve nova jornada Chrome nesta rodada. Resultados: [VALIDACAO.md](jarvis-gemini/VALIDACAO.md). Os números da versão 0.2 acima pertencem ao diagnóstico anterior.

O primeiro commit local desta entrega está previsto após as verificações, com seleção explícita dos arquivos. O contexto pessoal `CONVERSA-JARVIS.md`, dados de uso, login, backups, dependências e binários ficam fora desse commit. Não há remoto configurado nem push nesta entrega.

O código-fonte limita o prompt completo a 32.000 caracteres, incluindo instruções, JSON serializado e pedido. Preserva pedidos aceitos de até 12.000 caracteres e prioriza notas, tarefas e histórico. Os limites por componente e a seleção de trechos com posições/linhas estão documentados no [guia 0.3.0](jarvis-gemini/vault/wiki/jarvis-versao-0.3.md).

## Critérios concluídos nesta entrega

1. **Recuperação de trechos.** A versão 0.2 pontuava a nota completa, mas enviava apenas seus primeiros 3.000 caracteres e conservava até 20.000 na busca. As regressões da 0.3 demonstram evidência no meio/fim, inclusive depois de 20.000 caracteres, no contexto com origem verificável.
2. **Orçamento total.** As regressões verificam preservação do pedido e limite do prompt completo, com seleção previsível do histórico e sem reduzir os dados salvos.
3. **Falhas e concorrência.** As regressões cobrem timeout, JSON/formato inválido, erro, resposta vazia, inicialização do CLI e liberação dos locks. Falhas não bloqueiam pedidos seguintes.

## Próximas prioridades

1. **Validar Gemini e voz no PC.** Critério: resposta real que usa uma nota, transcrição conferida e leitura em português observadas pelo usuário. A jornada real no navegador e instalação em outro PC continuam separadas dos testes locais.
2. **Especificar perfis e ações no aplicativo.** Após consolidar a base, definir catálogo explícito, instruções confiáveis, ferramentas permitidas e registro de execução. Critério: as ações anunciadas são executadas e persistidas pelo serviço.

Esta entrega melhora contexto e confiabilidade; a integração dos perfis e de ferramentas no aplicativo continua sendo uma etapa futura. Detalhes: [README](jarvis-gemini/README.md), [guia 0.3.0](jarvis-gemini/vault/wiki/jarvis-versao-0.3.md) e [validação](jarvis-gemini/VALIDACAO.md).
