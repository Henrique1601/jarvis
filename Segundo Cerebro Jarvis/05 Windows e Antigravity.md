---
title: 05 Windows e Antigravity
tags: [jarvis, guia]
atualizado: 2026-10-11
---

# 🖥️ Windows e Antigravity

O site recebe o pedido; seu Windows processa pelo Antigravity. Vercel não executa o CLI. O painel mostra disponibilidade, última atualização e o pedido em andamento quando houver.

## Interpretar disponibilidade

- Conectado: o componente informou que está pronto.
- Processando: há uma execução em andamento.
- Offline: não há atualização recente; os pedidos aguardam na fila.
- Pausado: retome pelo console Windows.
- Login Google necessário: conclua o login oficial do CLI.
- Limite atingido: aguarde a cota da conta renovar.

O Windows atualiza presença a cada trinta segundos e é considerado offline após noventa. O site consulta a cada cinco segundos com pedidos pendentes e trinta quando a fila está vazia. O status não comprova sozinho que um novo pedido conseguirá gerar resposta.

## Inicialização e controle

CONFIGURAR-WORKER.bat oferece pausa, retomada, desconexão e instalação/desativação da tarefa JarvisWorker. A tarefa roda na sessão do usuário, sem privilégios elevados. Não inicie cópias adicionais do componente.

Ferramentas do Antigravity foram autorizadas pelo proprietário e seguem as permissões do CLI. O contexto não lê automaticamente o cofre local; isso não constitui sandbox de arquivos para ferramentas nativas. Não existe fallback automático para Gemini API.

Relacionados: [[09 Solução de problemas]], [[10 Arquitetura e decisões]].
