---
tags: [jarvis, roadmap, atualizacoes]
atualizado: 2026-10-09
status: roadmap
---

# Jarvis — próximas atualizações

Voltar: [[cerebro-jarvis]]. Skills propostas: [[jarvis-skills]].

A versão 0.2 implementou diagnóstico, edição/restauração, conflitos, histórico, importação sem sobrescrita e backup. A [[jarvis-versao-0.3|0.3.0]] acrescentou trechos com origem e orçamento total de contexto. A [[jarvis-versao-0.4|prévia 0.4.0]] preserva essa base e prepara Antigravity: 42 testes, instalação nova, build e smoke local aprovados, mas conversa bloqueada porque o CLI 1.3.2 anuncia ferramentas apesar de `tools: []`. A migração não foi concluída. As etapas abaixo continuam propostas ou pendentes, sem datas prometidas.

## Etapa 1 — controle efetivo do provedor e validação real

**Objetivo:** resolver o bloqueio das ferramentas antes de habilitar conversa e, então, validar provedor e voz no PC.

- Demonstrar isolamento e controle efetivo de ferramentas no CLI real. As tentativas com `tools: []` e allowlist não restringiram a lista anunciada no 1.3.2; o gate continua bloqueando antes do contexto.
- Se esse controle não puder ser demonstrado, apresentar a alternativa de API de texto com chave e cobrança separada da assinatura Google AI Pro, exigindo escolha do usuário.
- Após resolver o provedor, fazer o login apropriado e confirmar a restrição antes de transmitir pedido/notas.
- Validar primeira resposta real com nota, microfone, transcrição e leitura pt-BR no PC.
- Conferir a instalação em outro PC com instruções reproduzíveis.

**Critério de entrega:** permissões efetivamente restritas ou provedor de texto escolhido pelo usuário e implementado, seguido de resposta real com nota e áudio observados; instalação em outro PC conferida separadamente. Login sozinho, mocks e smoke local não resolvem a divergência das ferramentas.

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
- Provedor de modelo configurável, com avaliação de autenticação, disponibilidade e permissões de cada integração.
- Modo com modelo local, após avaliar hardware e qualidade em português.
- Controle de aplicativos por ferramentas específicas e com registro de execução.

**Critério de entrega:** sincronizar sem perder notas, autenticar acesso remoto e indicar claramente onde cada modelo processa os dados.

## Próximo passo recomendado

Preservar a prévia 0.4.0 para revisão e resolver o controle efetivo das ferramentas; a conversa permanece bloqueada antes de enviar contexto. Uma API de texto com chave e cobrança própria exige escolha do usuário. Depois validar resposta, transcrição e leitura. Pesquisa web, perfis Supremo no runtime e ferramentas de notas/tarefas exigem etapas próprias; busca semântica e CRM/Notion vêm após essa base.

