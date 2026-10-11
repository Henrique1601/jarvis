# Antigravity no Windows para o Jarvis online

## Funcionamento

O site permanece na Vercel. Login, notas, tarefas, histórico e pedidos ficam no Supabase. Um componente Python no Windows consulta a fila por HTTPS de saída e utiliza o Antigravity autenticado na conta Google do usuário. Não há túnel, porta pública no computador ou sincronização do cofre local.

O componente inicia na sessão do usuário, sem privilégios administrativos. A inicialização automática é opcional e reversível. A primeira configuração exige login Supabase e, separadamente, login Google pelo fluxo oficial do Antigravity. Senhas e códigos de autenticação nunca devem ser enviados no chat.

## Condição de ativação

O teste real do CLI oficial 1.3.3 continuou anunciando ferramentas apesar do perfil sem ferramentas. O runtime interrompeu a sessão antes de enviar o prompt. Portanto, **a execução permanece bloqueada**. A fila pode guardar pedidos, mas não haverá resposta enquanto essa restrição não for demonstrada.

São necessários dois controles administrativos: `JARVIS_ANTIGRAVITY_ENABLED=true` na Vercel e a autorização de execução no banco. Ambos devem permanecer desativados nesta entrega. O registro de um dispositivo ou seu heartbeat não habilita esses controles. A verificação do agente e da ausência de ferramentas também ocorre antes de cada envio ao CLI.

Uma configuração `tools: []`, modo de planejamento ou hook isolado não substitui a verificação real. Se o CLI anunciar ferramentas, pedir login, exceder o prazo ou retornar um protocolo inválido, nenhum contexto será enviado antes da autorização do runtime. Não há fallback automático para Gemini API.

## Pedidos e recuperação

- Pedidos aguardam até sete dias, inclusive com Windows desligado; notas e tarefas continuam disponíveis.
- Até cinco pedidos pendentes por conta, com limite de vinte novos pedidos por hora. Envios repetidos com o mesmo identificador não criam outro pedido.
- Processamento em ordem, uma mensagem por vez. O contexto é preparado ao reivindicar o pedido, usando somente dados online e respostas anteriores já concluídas.
- Pedido de até 12 mil caracteres; contexto de até 32 mil e seis fontes. O cofre local não entra no contexto.
- Estados: aguardando, processando, concluído, falhou, cancelado e expirado. O site recupera a fila após recarregar e permite cancelamento.
- A execução tem prazo de 180 segundos; a reserva dura 240 segundos e é renovada a cada 30 segundos. O início da geração é registrado separadamente.
- Uma execução interrompida após iniciar não é repetida automaticamente. A conclusão de uma resposta já obtida pode ser reenviada sem duplicar mensagens.
- O componente consulta a fila a cada dez segundos, atualiza disponibilidade a cada trinta e é considerado offline após noventa segundos.

## Credenciais e diagnóstico

Abra `jarvis-gemini/CONFIGURAR-WORKER.bat` para conectar a conta, verificar o CLI, pausar, retomar, desconectar ou consultar o estado local. A senha é digitada no console sem exibição e não é salva. `INICIAR-WORKER.bat` inicia manualmente. As opções de inicialização usam `INICIALIZACAO-WORKER.ps1`: uma tarefa oculta no Agendador, executada somente ao entrar na sessão do usuário, sem privilégios elevados. A instalação da tarefa exige verificação real do CLI e autorização online; nesta entrega ela será recusada. Desativar a inicialização remove somente essa tarefa.

Sessão Supabase, credencial revogável de dispositivo e resposta ainda não confirmada são protegidas com DPAPI em `%LOCALAPPDATA%/JarvisGemini/worker`. Não ficam no repositório nem no cofre Markdown. O dispositivo precisa da sessão da conta autorizada e de sua credencial própria; nenhuma chave administrativa do Supabase é necessária no computador.

Tokens Google continuam no armazenamento do CLI. Credenciais do componente não são herdadas pelo processo Antigravity. Logs operacionais não devem incluir pedido, resposta, fontes, senha ou tokens.

O CLI pode manter seus próprios registros e transcrições conforme a configuração oficial; apagar um workspace temporário não garante apagar esses registros. A assinatura está sujeita às quotas do Antigravity. A integração não habilita créditos extras, comandos de boost ou chamadas à Gemini API automaticamente.

## Publicação e reversão

Aplicar primeiro a migração aditiva da fila, mantendo a execução desativada; depois publicar API e frontend. Preservar registros existentes, dados locais e credenciais. Antes de ativar execução, validar isolamento entre contas, concorrência, cancelamento, expiração, recuperação e uma resposta real com o gate aprovado.

Para interromper processamento, desativar os controles de execução e pausar ou desconectar o componente. Não apagar pedidos, notas, tarefas ou histórico. Os critérios de conversa autenticada e retomada real após reinício permanecem pendentes enquanto o CLI estiver bloqueado.

## Evidências desta entrega

A investigação posterior da CLI e a proteção contra eventos de ferramenta estão em [DIAGNOSTICO-ANTIGRAVITY.md](../jarvis-gemini/DIAGNOSTICO-ANTIGRAVITY.md). A suíte Windows passou em 68 testes após essa proteção adicional. O processamento permanece desativado; o nome retornado pela CLI não comprova que o perfil foi carregado.

Em 10/10/2026, a migração aditiva `jarvis_cloud_v2_antigravity_queue` foi aplicada com execução desativada. `supabase/verify-queue.sql` passou no Postgres real com usuários sintéticos e rollback: isolamento, FIFO, idempotência, quotas, cancelamento, expiração, reservas, revogação, conclusão atômica e bloqueio durante execução. Os registros anteriores permaneceram: uma nota, uma tarefa, duas versões de histórico e nenhuma mensagem. Nenhum usuário sintético permaneceu no banco.

A suíte Windows completa passou em 65 testes, incluindo DPAPI e mutex reais com dados sintéticos. A verificação real do CLI 1.3.3 anunciou 60 ferramentas; nenhum prompt foi transmitido. Uma resposta autenticada e retomada real após reinício continuam impedidas por esse resultado, sem substituir a prova por testes simulados.

Passaram também 66 testes web e o build. O commit `d95315d` ficou READY na Vercel e passou nos dois jobs de CI. Pela interface autenticada, um pedido sintético foi guardado sem worker, recuperado após recarga com posição e prazo de sete dias e cancelado; o cancelamento persistiu após recarga. Nenhuma resposta foi gerada, nenhum dispositivo foi registrado e a nota e tarefa anteriores permaneceram disponíveis.
