---
tags: [jarvis, projeto, cerebro]
atualizado: 2026-10-09
status: versao-0.3-validada-localmente
---

# Cérebro do projeto Jarvis

Assistente pessoal de Henrique para Windows, com painel web local, Gemini CLI, memória Markdown, tarefas e voz opcional. O objetivo é apoiar estudos de IA, programação e organização dos projetos.

## Versão atual: 0.3.0

Consulte [[jarvis-versao-0.3]] para contexto e confiabilidade, implementados e validados localmente. [[jarvis-versao-0.2]] registra diagnóstico, edição com histórico, backup e executável Windows da versão anterior. Conversa autenticada, microfone/transcrição e leitura real ainda dependem de validação pelo usuário.

## Mapa do cérebro

- [[jarvis-configuracao|Configurar e instalar no Windows]]
- [[jarvis-uso|Usar conversa, voz, notas e tarefas]]
- [[jarvis-skills|Skills: papel no projeto e módulos planejados]]
- [[jarvis-atualizacoes|Próximas atualizações e critérios de entrega]]
- [[jarvis-versao-0.3|Entrega 0.3.0: contexto e confiabilidade]]
- [[boas-vindas|Como a memória está organizada]]

## O que existe nesta versão

| Camada | Implementação atual |
| --- | --- |
| Painel | HTML, CSS e JavaScript; abre no navegador local |
| Serviço | Python, em `127.0.0.1:8765` |
| Inteligência | Gemini CLI com login Google; processamento na nuvem |
| Memória | Markdown no cofre; recuperação por palavras |
| Tarefas | Lista com marcação de conclusão, salva em `state.json` |
| Transcrição | Whisper base em CPU, instalação opcional |
| Leitura | Vozes System.Speech/SAPI instaladas no Windows |
| Distribuição | Código-fonte e `.exe` compilado no Windows; microfone opcional pela versão fonte |

O `.exe` gerado abre o painel no navegador. Não há janela desktop independente nesta versão.

## Como o cérebro participa da conversa

A busca dá maior peso ao título e ignora palavras comuns. A versão 0.3.0 recupera trechos relacionados ao pedido, inclusive depois de 20.000 caracteres, em até seis notas, com arquivo, posições e linhas de origem. O prompt completo tem teto de 32.000 caracteres, incluindo instruções e JSON, e preserva o pedido aceito de até 12.000 caracteres. Prioriza notas, depois tarefas e histórico. Cada nota pode fornecer até três trechos de 1.000 caracteres; são consideradas até cinquenta tarefas com textos de 300 caracteres e até dez mensagens com os 2.000 caracteres finais de cada uma. O serviço reduz ou omite contexto para respeitar o orçamento, sem alterar os dados salvos. Veja [[jarvis-versao-0.3]]. Não envia automaticamente o cofre inteiro. Links do Obsidian ajudam a navegar, mas o serviço não percorre esses links para recuperar outras notas.

As notas são conhecimento de referência, não instruções executáveis. Escrever uma skill no Obsidian não instala uma ferramenta nem autoriza ações. A ativação de skills é uma atualização proposta em [[jarvis-skills]].

## Decisões registradas

- Plataforma principal: Windows.
- Forma inicial: painel web local, com opção de build `.exe`.
- Modelo inicial: Gemini pelo login Google do CLI.
- Memória: arquivos portáveis, editáveis no Obsidian.
- Prioridade: consolidar recuperação de contexto e tratamento de falhas, depois validar Gemini e voz no PC antes de ampliar integrações.

## Situação da verificação

Na versão 0.3.0, 32 testes passaram com Python 3.14.5 no Windows; JavaScript e sintaxe Python foram verificados. O executável real foi compilado e verificado por HTTP com dados descartáveis, sem Gemini/login. A jornada Chrome pertence à validação anterior da versão 0.2. O registro técnico fica em `VALIDACAO.md` no código-fonte. Conversa autenticada, microfone/Whisper e leitura SAPI real continuam pendentes; as respostas do CLI nos testes são simuladas. A instalação em outro PC ainda não foi validada.

Diagnóstico, memória com histórico e backup permanecem disponíveis. Perfis/skills no aplicativo, busca semântica e integrações continuam planejados.

