# Antigravity no Windows para o Jarvis online

## Funcionamento

O site permanece na Vercel. Login, notas, tarefas, histórico e pedidos ficam no Supabase. Um componente Python no Windows consulta a fila por HTTPS de saída e utiliza o Antigravity autenticado na conta Google do usuário. Não há túnel, porta pública no computador ou sincronização do cofre local.

O componente inicia na sessão do usuário, sem privilégios administrativos. A tarefa de inicialização ao logon foi registrada e iniciada; o próximo logon real ainda precisa ser observado. A inicialização automática é reversível. A primeira configuração exige login Supabase e, separadamente, login Google pelo fluxo oficial do Antigravity. Senhas e códigos de autenticação nunca devem ser enviados no chat.

## Condição de ativação

Os controles administrativos estão habilitados na Vercel e no Supabase. Em 11/10/2026, o usuário conectou a conta no worker Windows. O componente processou e concluiu um pedido enviado anteriormente pelo site com o Windows offline; a resposta foi salva em transação. Pausa e retomada pela tarefa agendada preservaram o resultado sem duplicação. A leitura autenticada do painel pelo worker passou. A confirmação visual dessa resposta no Chrome aguarda novo login após um erro de acesso da sessão anterior.

Em 10/10/2026, o proprietário autorizou remover o bloqueio por ferramentas. O CLI 1.3.3 continua anunciando 60 ferramentas; agora isso é aceito pelo transporte. O nome retornado no evento inicial não prova que o perfil foi carregado. O Jarvis valida o protocolo e mantém as permissões normais do CLI, sem usar flags para ignorar aprovações.

São necessários dois controles administrativos: `JARVIS_ANTIGRAVITY_ENABLED=true` na Vercel e a autorização de execução no banco. Além disso, o Windows precisa conectar a conta Supabase e o login Google do CLI. O registro do dispositivo e seu heartbeat não habilitam os controles administrativos por conta própria.

O contexto online é preparado sem ler o cofre local. Isso não constitui sandbox de arquivos: ferramentas nativas podem acessar recursos permitidos ao processo Windows. As instruções do perfil não garantem confinamento. Login ausente, protocolo inválido, limites, prazo e cancelamento continuam tratados. Não há fallback automático para Gemini API.

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

Abra `jarvis-gemini/CONFIGURAR-WORKER.bat` para conectar a conta, verificar o CLI, pausar, retomar, desconectar ou consultar o estado local. Por solicitação do proprietário em 11/10/2026, a senha é exibida enquanto é digitada ou colada no console; ela não é salva. `INICIAR-WORKER.bat` inicia manualmente. As opções de inicialização usam `INICIALIZACAO-WORKER.ps1`: uma tarefa oculta no Agendador, executada somente ao entrar na sessão do usuário, sem privilégios elevados. A instalação exige verificação do protocolo do CLI e autorização online. Desativar a inicialização remove somente essa tarefa.

Sessão Supabase, credencial revogável de dispositivo e resposta ainda não confirmada são protegidas com DPAPI em `%LOCALAPPDATA%/JarvisGemini/worker`. Não ficam no repositório nem no cofre Markdown. O dispositivo precisa da sessão da conta autorizada e de sua credencial própria; nenhuma chave administrativa do Supabase é necessária no computador.

Tokens Google continuam no armazenamento do CLI. Credenciais do componente não são herdadas pelo processo Antigravity. Logs operacionais não devem incluir pedido, resposta, fontes, senha ou tokens.

O CLI pode manter seus próprios registros e transcrições conforme a configuração oficial; apagar um workspace temporário não garante apagar esses registros. A assinatura está sujeita às quotas do Antigravity. A integração não habilita créditos extras, comandos de boost ou chamadas à Gemini API automaticamente.

## Publicação e reversão

Aplicar primeiro a migração aditiva da fila, mantendo a execução desativada; depois publicar API e frontend. Preservar registros existentes, dados locais e credenciais. Antes de ativar execução, validar isolamento entre contas, concorrência, cancelamento, expiração, recuperação e uma resposta real com o gate aprovado.

Para interromper processamento, desativar os controles de execução e pausar ou desconectar o componente. Não apagar pedidos, notas, tarefas ou histórico. Uma resposta direta do CLI não valida sozinha a fila autenticada nem a retomada real após reinício.

## Evidências desta entrega

A investigação posterior da CLI e a proteção contra eventos de ferramenta estão em [DIAGNOSTICO-ANTIGRAVITY.md](../jarvis-gemini/DIAGNOSTICO-ANTIGRAVITY.md). A suíte Windows passou em 68 testes após essa proteção adicional. O processamento permanece desativado; o nome retornado pela CLI não comprova que o perfil foi carregado.

Em 10/10/2026, a migração aditiva `jarvis_cloud_v2_antigravity_queue` foi aplicada com execução desativada. `supabase/verify-queue.sql` passou no Postgres real com usuários sintéticos e rollback: isolamento, FIFO, idempotência, quotas, cancelamento, expiração, reservas, revogação, conclusão atômica e bloqueio durante execução. Os registros anteriores permaneceram: uma nota, uma tarefa, duas versões de histórico e nenhuma mensagem. Nenhum usuário sintético permaneceu no banco.

A suíte Windows completa passou em 65 testes, incluindo DPAPI e mutex reais com dados sintéticos. A verificação real do CLI 1.3.3 anunciou 60 ferramentas; nenhum prompt foi transmitido. Uma resposta autenticada e retomada real após reinício continuam impedidas por esse resultado, sem substituir a prova por testes simulados.

Passaram também 66 testes web e o build. O commit `d95315d` ficou READY na Vercel e passou nos dois jobs de CI. Pela interface autenticada, um pedido sintético foi guardado sem worker, recuperado após recarga com posição e prazo de sete dias e cancelado; o cancelamento persistiu após recarga. Nenhuma resposta foi gerada, nenhum dispositivo foi registrado e a nota e tarefa anteriores permaneceram disponíveis.
