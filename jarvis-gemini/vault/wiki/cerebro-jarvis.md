---
tags: [jarvis, projeto, cerebro]
atualizado: 2026-10-09
status: previa-0.4-conversa-bloqueada
---

# Cérebro do projeto Jarvis

Assistente pessoal de Henrique para Windows, com painel web local, Antigravity CLI, memória Markdown, tarefas e voz opcional. O objetivo é apoiar estudos de IA, programação e organização dos projetos.

## Versão atual: prévia 0.4.0

Consulte [[jarvis-versao-0.4]] para a prévia Antigravity: checks locais aprovados, mas migração não concluída e conversa bloqueada porque o CLI anuncia ferramentas apesar de `tools: []` e da tentativa de allowlist. Login sozinho não resolve essa divergência. [[jarvis-versao-0.3]] registra contexto e confiabilidade preservados; [[jarvis-versao-0.2]] registra diagnóstico, histórico e backup. Autenticação, resposta real e áudio continuam pendentes.

## Mapa do cérebro

- [[jarvis-configuracao|Configurar e instalar no Windows]]
- [[jarvis-uso|Usar conversa, voz, notas e tarefas]]
- [[jarvis-skills|Skills: papel no projeto e módulos planejados]]
- [[jarvis-atualizacoes|Próximas atualizações e critérios de entrega]]
- [[jarvis-versao-0.4|Prévia 0.4.0: Antigravity e bloqueio da conversa]]
- [[jarvis-versao-0.3|Entrega 0.3.0: contexto e confiabilidade]]
- [[boas-vindas|Como a memória está organizada]]

## O que existe nesta versão

| Camada | Implementação atual |
| --- | --- |
| Painel | HTML, CSS e JavaScript; abre no navegador local |
| Serviço | Python, em `127.0.0.1:8765` |
| Inteligência | Integração Antigravity CLI nativo; conversa bloqueada pela lista real de ferramentas |
| Memória | Markdown no cofre; recuperação por palavras |
| Tarefas | Lista com marcação de conclusão, salva em `state.json` |
| Transcrição | Whisper base em CPU, instalação opcional |
| Leitura | Vozes System.Speech/SAPI instaladas no Windows |
| Distribuição | Código-fonte e `.exe` compilado no Windows; microfone opcional pela versão fonte |

O `.exe` gerado abre o painel no navegador. Não há janela desktop independente. O build e smoke HTTP 0.4.0 passaram; isso não habilita a conversa bloqueada pelo CLI. O nome `JarvisGemini.exe` e o caminho padrão `%LOCALAPPDATA%/JarvisGemini` são preservados por compatibilidade.

## Como o cérebro participa da conversa

A busca dá maior peso ao título e ignora palavras comuns. A versão 0.3.0 recupera trechos relacionados ao pedido, inclusive depois de 20.000 caracteres, em até seis notas, com arquivo, posições e linhas de origem. O prompt completo tem teto de 32.000 caracteres, incluindo instruções e JSON, e preserva o pedido aceito de até 12.000 caracteres. Prioriza notas, depois tarefas e histórico. Cada nota pode fornecer até três trechos de 1.000 caracteres; são consideradas até cinquenta tarefas com textos de 300 caracteres e até dez mensagens com os 2.000 caracteres finais de cada uma. O serviço reduz ou omite contexto para respeitar o orçamento, sem alterar os dados salvos. Veja [[jarvis-versao-0.3]]. Não envia automaticamente o cofre inteiro. Links do Obsidian ajudam a navegar, mas o serviço não percorre esses links para recuperar outras notas.

As notas são conhecimento de referência, não instruções executáveis. Escrever uma skill no Obsidian não instala uma ferramenta nem autoriza ações. A ativação de skills é uma atualização proposta em [[jarvis-skills]].

## Decisões registradas

- Plataforma principal: Windows.
- Forma inicial: painel web local, com opção de build `.exe`.
- Provedor atual: Antigravity CLI nativo, após encerramento do login individual do Gemini CLI pelo Google.
- Objetivo da migração: conversa somente texto; confirmar perfil `jarvis-chat` e `init.tools` vazio antes de enviar contexto. O CLI real anunciou ferramentas; o gate bloqueou a sessão sem prompt.
- Memória: arquivos portáveis, editáveis no Obsidian.
- Prioridade: demonstrar isolamento/controle efetivo das ferramentas ou escolher API de texto com chave e cobrança próprias; depois validar conversa e voz antes de ampliar integrações.

## Situação da verificação

Na prévia 0.4.0, 42 testes, JavaScript, sintaxe Python, instalação nova com download/SHA-512, build e smoke HTTP do executável passaram. O CLI real confirmou `jarvis-chat`, mas anunciou cerca de 59 ferramentas apesar do perfil vazio; a tentativa de allowlist também não restringiu a lista. O gate bloqueou antes de transmitir pedido/notas. A migração não foi concluída. Login é pendência separada e não resolve sozinho o bloqueio. Mocks não demonstram sozinhos a segurança do CLI autenticado; resposta real, Whisper/SAPI e instalação em outro PC continuam pendentes. Registro técnico: `VALIDACAO.md`; a jornada Chrome pertence à versão 0.2.

Diagnóstico, memória com histórico e backup permanecem disponíveis. Perfis/skills no aplicativo, busca semântica e integrações continuam planejados.

