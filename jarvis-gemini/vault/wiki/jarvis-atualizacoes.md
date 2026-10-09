---
tags: [jarvis, roadmap, atualizacoes]
atualizado: 2026-10-09
status: roadmap
---

# Jarvis — próximas atualizações

Voltar: [[cerebro-jarvis]]. Skills propostas: [[jarvis-skills]].

A versão 0.2 implementou diagnóstico, edição e restauração de notas, conflitos, histórico, importação sem sobrescrita e backup. A [[jarvis-versao-0.3|0.3.0]] acrescenta recuperação de trechos com origem, orçamento total de contexto e tratamento de falhas do CLI, com 32 testes aprovados e executável validado localmente por HTTP. A indicação de notas enviadas permanece disponível. As etapas abaixo continuam propostas ou pendentes de validação real, sem datas prometidas. A ordem prioriza uma base confiável, depois ferramentas e memória, e por último maior autonomia.

## Etapa 1 — validação real no Windows

**Objetivo:** conferir o comportamento real de Gemini e voz no PC depois dos testes locais da versão 0.3.0.

- Validar login Google, primeira resposta real com nota, microfone, transcrição e leitura pt-BR no PC.
- Conferir a instalação em outro PC com instruções reproduzíveis.

**Critério de entrega:** resposta autenticada com evidência de uma nota e áudio observados no Windows; instalação em outro PC conferida separadamente. Testes com Gemini simulado e teste local do executável não encerram essas verificações.

## Etapa 2 — memória e Obsidian

**Objetivo:** tornar o cérebro consultável e atualizado com menos trabalho manual.

- Adicionar exclusão de notas com recuperação.
- Adicionar tags, filtros por projeto e modelos de notas.
- Implantar busca semântica local e avaliar a recuperação com perguntas reais.

**Critério de entrega:** encontrar notas relevantes mesmo com palavras diferentes e medir a recuperação com perguntas reais; excluir e recuperar uma nota sem perder seu conteúdo.

## Etapa 3 — skills e ações locais

**Objetivo:** passar de sugestões para ações bem definidas dentro do Jarvis.

- Implementar catálogo explícito de perfis e [[jarvis-skills|skills]], com instruções confiáveis separadas do conteúdo das notas.
- Permitir criar notas e tarefas pela conversa usando ferramentas validadas.
- Adicionar prazos, recorrência e calendário interno de tarefas.
- Criar histórico de execução e impedir duplicação em tentativas repetidas.
- Mostrar quais ferramentas cada perfil/skill usa e restringir as permissões por ação.

**Critério de entrega:** pedir para criar uma tarefa ou guardar uma ideia e conferir o resultado persistido, com registro de sucesso ou falha.

## Etapa 4 — CRM, Notion e MCP

**Objetivo:** conectar os projetos de Henrique às ferramentas que ele já utiliza.

- Integrar a API do CRM e o Notion após conferir seus esquemas atuais.
- Consultar e cadastrar leads nos dois destinos, conforme o fluxo desejado.
- Identificar duplicados antes de cadastrar.
- Registrar quando apenas um destino foi atualizado e permitir retomar o outro.
- Conectar ferramentas via MCP com permissões por operação.
- Integrar agenda externa com datas e fuso horário corretos.

**Critério de entrega:** um lead de teste aparece uma única vez no CRM e no Notion; repetir a operação não cria cópias; uma falha parcial é visível e recuperável.

## Etapa 5 — automações

**Objetivo:** executar rotinas nos horários definidos.

- Agendador persistente com fuso `America/Sao_Paulo`.
- Resumo de IA/programação e revisão de tarefas.
- Sessões recorrentes de estudo com progresso registrado.
- Notificações, histórico, retentativas limitadas e tratamento de horários perdidos.

**Critério de entrega:** a rotina executa uma vez por horário e continua após reiniciar. Rotinas locais exigem o PC ligado e o serviço ativo; operação com o PC desligado demandará infraestrutura externa.

## Etapa 6 — experiência desktop e voz

**Objetivo:** abrir e conversar com o Jarvis com menos passos.

- Janela desktop, bandeja do sistema e opção de iniciar com o Windows.
- Atalho global para falar.
- Escolha de microfone, modelo Whisper e voz.
- Interromper a leitura e acompanhar estados de escuta/processamento.
- Palavra de ativação opcional, com indicador de escuta.
- Avaliar aceleração de transcrição na GPU depois de medir o uso em CPU.

**Critério de entrega:** iniciar, falar, ouvir, interromper e encerrar no Windows com comportamento previsível e consumo medido.

## Etapa 7 — múltiplos dispositivos e modelos

- Sincronização entre os dois PCs com identificação de conflitos.
- Acesso autenticado pelo celular.
- Provedor de modelo configurável, mantendo Gemini CLI como opção.
- Modo com modelo local, após avaliar hardware e qualidade em português.
- Controle de aplicativos por ferramentas específicas e com registro de execução.

**Critério de entrega:** sincronizar sem perder notas, autenticar acesso remoto e indicar claramente onde cada modelo processa os dados.

## Próximo passo recomendado

Validar login Gemini, conversa com evidência de uma nota, transcrição e leitura no Windows. Depois, integrar perfis e ferramentas controladas para notas e tarefas. A busca semântica e as integrações CRM/Notion vêm após essa base.

