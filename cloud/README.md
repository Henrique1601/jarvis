# Jarvis web 0.6.0 — Supabase e fila Antigravity no Windows

**Atualização de 11/10/2026:** o proprietário autorizou ferramentas do CLI e conectou o componente Windows. Um pedido enviado com o Windows indisponível foi processado; a resposta apareceu no Chrome e permaneceu após recarregar. Pausa e retomada pela tarefa agendada não duplicaram mensagens. O próximo login real do Windows ainda precisa ser observado. As evidências de bloqueio abaixo são históricas.

O painel online autentica a conta e guarda memória, tarefas, conversa e pedidos no Supabase. A versão 0.6 implementa uma fila: o navegador pode enviar pedidos mesmo com o computador desligado; um worker Windows consulta a fila por HTTPS e utiliza o Antigravity com o login Google oficial. Vercel não executa o CLI nem acessa o disco do computador.

**Situação atual:** fila 0.6 [publicada](https://jarvis-ten-pi-14.vercel.app/), migração aplicada e envio, persistência após recarga e cancelamento verificados na conta autenticada. Processamento Antigravity habilitado no projeto existente, com resposta real validada. O contexto usa dados online; ferramentas seguem as permissões normais do CLI, sem garantia de sandbox de arquivos. Pedidos aguardando expiram após sete dias; não há fallback automático para Gemini API.

Veja [Antigravity no Windows](ANTIGRAVITY-WINDOWS.md) para configurar o componente e entender a política atual.

## Arquitetura e dados

A API valida o Bearer token em `/auth/v1/user`, exige e-mail confirmado e autorizado em `ALLOWED_EMAILS`, recusa contas anônimas e opera com as permissões da sessão. RLS e RPCs também exigem presença na tabela administrativa `jarvis_allowed_emails`, sem leitura ou escrita pelo cliente. As duas listas devem coincidir. Não substitua a sessão por `service_role`, que ignora RLS. Referência: [políticas e privilégios Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

`api/index.mjs` atende os endpoints; `lib/` contém HTTP, banco, contexto e fila. `supabase/schema.sql` prepara os dados básicos e `supabase/queue.sql` acrescenta jobs, dispositivos e operações do worker. O contexto vem das notas, tarefas e conversa online. O worker usa um workspace separado por execução e não importa o cofre Windows.

## Fila e painel

- `POST /api/chat` envia `{text, requestId}` com UUID de idempotência e recebe `202` com `jobId`, estado e prazo. Uma resposta de conexão incerta reutiliza o mesmo UUID na tentativa seguinte do mesmo texto.
- Há até cinco pedidos pendentes por conta. O prazo de sete dias vem do servidor. Os estados são `queued`, `processing`, `completed`, `failed`, `cancelled` e `expired`.
- `GET /api/state` inclui os vinte pedidos mais recentes e o estado do worker. `GET /api/chat-job?id=UUID` consulta um pedido; `POST /api/chat-cancel` cancela pelo `jobId`, inclusive durante processamento.
- O painel mostra pedidos ainda não concluídos e recebe respostas concluídas pelo histórico, sem duplicar o pedido. A posição é mostrada quando fornecida pelo servidor. Login Google, limite de uso, falta de conexão e bloqueio de permissões têm mensagens próprias.
- Com pedidos pendentes, a aba ativa atualiza o estado a cada cinco segundos; sem pendências, consulta a disponibilidade do Windows a cada trinta segundos, sem sobrepor leituras. Ocultar a aba ou bloquear a sessão pausa as consultas; voltar à aba ou recuperar a conexão atualiza o estado. Um aviso de consulta indisponível é removido quando a consulta se recupera, preservando avisos de outras operações. Novos pedidos ficam bloqueados somente durante seu próprio envio.
- Respostas exibem títulos, listas, negrito, ênfase e código com formatação Markdown básica. HTML, links e imagens permanecem inativos. “Guardar resposta” conserva o conteúdo Markdown original; a formatação não modifica o histórico.

O navegador não recebe a credencial do dispositivo. `CONFIGURAR-WORKER.bat` solicita os dados necessários no console Windows; o login Google ocorre na interface oficial do Antigravity, fora do painel web. Pausa, desconexão e credencial protegida pelo Windows estão descritas no guia do componente. O backup online continua exportando os dados da conta.

## Configurar Supabase

1. O projeto existente tem referência `jsyihprjzjjcjgpgnfrt`, em São Paulo. As migrações `jarvis_cloud_v1` e `jarvis_cloud_v2_antigravity_queue` foram aplicadas. A execução da fila foi habilitada após configuração e validação autenticadas.
2. Em outro projeto, revise e aplique `supabase/schema.sql` antes de `supabase/queue.sql`. No projeto existente, confira o histórico e revise a migração adicional antes de aplicá-la. Não execute um script em um destino presumido.
3. Em uma instalação nova, mantenha o gate administrativo e `JARVIS_ANTIGRAVITY_ENABLED=false` até configurar o componente e validar protocolo, permissões escolhidas e execução autenticada. O projeto existente está habilitado conforme a política autorizada pelo proprietário.
4. Prepare contas Supabase Auth com e-mail confirmado. Pelo SQL Editor administrativo, insira os e-mails permitidos em `public.jarvis_allowed_emails`, em minúsculas, e mantenha os mesmos em `ALLOWED_EMAILS`. Cadastro pela interface não concede autorização automaticamente.
5. Cadastre a URL final como Site URL e os retornos necessários em Redirect URLs; previews e localhost têm URLs próprias. Veja [URLs de autenticação](https://supabase.com/docs/guides/auth/redirect-urls).
6. Confira isolamento, quotas, cancelamento e conclusão transacional com `supabase/verify.sql` e `supabase/verify-queue.sql`, em um projeto preparado para testes. A verificação da fila passou no Postgres real em 10/10/2026 com usuários sintéticos e rollback, sem alterar os dados existentes ou ativar o processamento.

Exemplo administrativo, com placeholder para preencher somente na interface Supabase:

```sql
insert into public.jarvis_allowed_emails (email)
values ('seu-email-autorizado@example.com')
on conflict (email) do nothing;
```

Não publique a lista real, senhas, tokens, credenciais de dispositivo ou chaves de serviço em exemplos, commits ou conversa.

## Variáveis do servidor

| Nome | Conteúdo | Local |
| --- | --- | --- |
| `SUPABASE_URL` | URL do projeto Supabase | Servidor |
| `SUPABASE_ANON_KEY` | Chave pública `anon` ou publishable; acesso continua condicionado à sessão e RLS | Servidor; configuração pública necessária chega ao frontend |
| `ALLOWED_EMAILS` | E-mails autorizados, separados por vírgula e confirmados | Somente servidor |
| `JARVIS_AI_PROVIDER` | `antigravity_windows`, padrão da versão 0.6 | Servidor |
| `JARVIS_ANTIGRAVITY_ENABLED` | `true` no projeto validado; `false` suspende processamento. O gate do banco também precisa autorizar execução | Servidor |

Use Environment Variables da Vercel nos ambientes corretos. Mudanças de ambiente exigem novo deployment. `GET /api/config` fornece somente URL e chave pública Supabase, sem allowlist ou segredos. [Referência Vercel](https://vercel.com/docs/environment-variables).

A fila Windows não exige `GEMINI_API_KEY` nem `GEMINI_MODEL`. O backend mantém o caminho anterior somente para seleção explícita de `JARVIS_AI_PROVIDER=gemini_api`; a presença de uma chave não ativa esse caminho nem cria fallback. Essa alternativa não é o provedor escolhido para a entrega 0.6.

## Desenvolvimento e checks

Use Node.js 24 na pasta `cloud/`:

```powershell
npm ci
npm test
npm run build
```

O build gera `public/` com uma lista explícita de assets compartilhados de `../jarvis-gemini/web/`. Não copia cofre, conversa importada, credenciais, binários ou dados de uso. O CI roda sem credenciais e não aplica SQL nem valida login, execução Antigravity ou banco reais.

Os testes Windows são independentes, na pasta `jarvis-gemini/`:

```powershell
py -3 -m unittest discover -s tests -v
```

## Deploy na Vercel

O repositório [Henrique1601/jarvis](https://github.com/Henrique1601/jarvis) está conectado ao projeto Vercel `prj_emYK9JO8g3C20VgvSJoIYwlAKPna`. A publicação automática após push e a jornada autenticada da fila foram confirmadas; cada alteração exige seus próprios checks.

1. Use Root Directory `cloud`, Node.js 24, preset Other, Build Command `npm run build` e Output Directory `public`.
2. Mantenha Include source files outside of the Root Directory habilitado: o build usa os assets de `jarvis-gemini/web/`. `vercel.json` encaminha `/api/*` ao handler preservando rota e query.
3. Prepare as variáveis acima, schema, fila, allowlist e URLs de Auth. Em instalações novas, habilite os dois gates somente após configurar e validar o componente.
4. Verifique preview e produção: login/logout, sessão entre abas, persistência de notas/tarefas, envio offline, prazo, status e cancelamento da fila. Registre migração, commit, deployment e evidências somente após os checks reais.

O worker inicia conexões HTTPS para a nuvem. Não é necessário túnel nem porta pública; o painel local continua em `127.0.0.1`.

## Critérios de aceite da versão 0.6

- Build e testes aprovados; nenhum segredo no bundle ou histórico Git.
- Login/logout, recuperação e troca de conta seguros; nenhum polling anônimo ou resposta privada atrasada exibida após sair.
- Memória e tarefas persistidas; RLS/RPC impedem acesso entre contas.
- Fila durável e idempotente, limite de pendentes, prazo de sete dias, cancelamento e status verificados no banco e no deploy real.
- Worker respeita gates antes de buscar/iniciar pedido; resultado incerto não provoca geração automática repetida; conclusão persiste o par de mensagens atomicamente.
- Processamento real exige protocolo válido, permissões escolhidas conscientemente e jornada autenticada completa. O proprietário autorizou ferramentas; o transporte não exige inventário vazio. Essa política não comprova confinamento de arquivos.

## Registro histórico da entrega inicial 0.6 — 10/10/2026

| Verificação | Resultado |
| --- | --- |
| Testes cloud | 66 aprovados: 29 backend e 37 frontend/build, em aproximadamente 0,71 s; dados sintéticos e mocks |
| Build e sintaxe JavaScript | `npm run build` e `node --check` de platform/app/workspace aprovados |
| Suíte Windows completa da fila | 65 testes aprovados em 12,044 s; DPAPI e mutex reais com dados sintéticos |
| Migração da fila e isolamento no Supabase real | `jarvis_cloud_v2_antigravity_queue` aplicada; `verify-queue.sql` passou com rollback; dados anteriores preservados e execução desativada |
| Publicação e jornada da fila na Vercel | Commit `d95315d`, deployment `dpl_G5eWfhXSwWLUFoE5MLjFtb1axvhy` READY. Pedido sintético enviado sem worker; posição 1 e prazo de sete dias confirmados após recarga; cancelamento persistido após outra recarga. Nenhuma mensagem gerada; nota e tarefa anteriores preservadas |
| GitHub CI | [Dois jobs aprovados](https://github.com/Henrique1601/jarvis/actions/runs/38082121979) para `d95315d` |
| Execução Antigravity autenticada | Bloqueada pela lista real de ferramentas; nenhum pedido enviado |

Inicialização ao logon foi implementada, mas não registrada. Configuração real de credenciais, resposta autenticada e retomada real após reinício permanecem pendentes até a comprovação do controle de ferramentas. O pedido sintético cancelado foi preservado como registro de validação. A inclusão dos pedidos no backup foi verificada no Postgres real; um arquivo baixado pelo navegador não foi inspecionado nesta etapa.

## Registro histórico — entrega 0.5 com Gemini API

**Os resultados abaixo pertencem à versão 0.5 publicada. Não comprovam migração, publicação ou processamento da nova fila 0.6.** A chave Gemini foi adiada naquela entrega; a escolha atual é Antigravity no Windows.


| Verificação | Resultado |
| --- | --- |
| Testes locais web | 37 aprovados (15 de backend e 22 de frontend), em aproximadamente 0,75 s; sem login/Gemini reais |
| Build do frontend | `npm ci` e `npm run build` aprovados; auditoria reportou zero vulnerabilidades conhecidas |
| Suíte Windows na entrega 0.5 | 42 testes aprovados na última execução, em 14,871 s; uma execução intermediária falhou isoladamente no teste de concorrência, e a repetição passou |
| Schema no projeto Supabase real | Migração `jarvis_cloud_v1` aplicada; allowlist do proprietário inserida pela interface administrativa |
| Operações e isolamento no Postgres real | Aprovados em transação com três usuários sintéticos e rollback: conflito de edição, histórico/restauração, tarefas, par atômico de mensagens, rejeição de reserva reutilizada e fontes excessivas, limite de 20 tentativas e rejeição da 21ª, backup completo, escrita direta recusada, RLS/RPC entre usuários, allowlist e RPC anônimo |
| Login e persistência pela interface publicada | Aprovados na conta real: abertura em nova aba e sessão após recarga; nota criada, editada e restaurada pelo histórico; tarefa criada e concluída; recarga confirmou nota restaurada e tarefa concluída. Dados sintéticos identificados como validação foram mantidos na conta |
| Backup pela interface | A interface confirmou a exportação do JSON; o evento de download não foi detectado pela automação, portanto o arquivo baixado não foi inspecionado independentemente |
| Resposta autenticada Gemini API na 0.5 | Não testada; a configuração da chave foi adiada naquela entrega |
| GitHub | Correção de sessão `3ad639c` publicada em `main`; ambos os jobs de [CI aprovados](https://github.com/Henrique1601/jarvis/actions/runs/38058458715) |
| Vercel | Deploy de produção `dpl_BPPMA3sPA2GXXX5EKkwtcGNCwjNj` em `READY`, commit `3ad639c`, raiz `cloud`; [domínio principal](https://jarvis-ten-pi-14.vercel.app/) |
| HTTP público | Painel, assets JavaScript, `/api/config` e `/api/health`: 200; `/api/state` sem login: 401 JSON. Health indica `aiInstalled: false`, conforme adiamento da chave |
| Retorno do login | Site URL Supabase configurada para `https://jarvis-ten-pi-14.vercel.app/` |

Resultados locais com mocks, configuração remota e jornadas autenticadas são registrados separadamente. O CI possui dois jobs de até dez minutos, acesso `contents: read` e actions fixadas em SHAs verificados. Executa em push para `main` e pull requests; os dois jobs do commit `3ad639c` passaram no GitHub.

O script `supabase/verify.sql` reproduz os testes de banco com usuários sintéticos numa transação revertida ao final. Execute-o integralmente em um projeto de teste preparado com o schema; ele não valida e-mail, senha, navegação ou respostas da Gemini API. A verificação final também confirmou RLS nas seis tabelas e ausência de usuários e notas sintéticos após o rollback.

## Relação com o Windows

O cofre Markdown, o áudio Whisper/SAPI e o executável local continuam separados dos dados web. Sincronização ou importação automática do cofre e compartilhamento do login Google com o navegador não foram implementados.

## Sessão entre abas


A confirmação de e-mail pode abrir outra aba. A sessão usa o armazenamento compartilhado padrão do Supabase SDK; eventos de autenticação são confirmados pela sessão salva e pela API antes de mostrar o painel. A atualização migra a sessão antiga da mesma aba quando ela ainda existe. Se a aba autenticada foi fechada antes da atualização, entre novamente. Há regressões para broadcast sem sessão, login entre abas, migração e troca de conta.

O login distingue credenciais incorretas, e-mail não confirmado, limite de tentativas e indisponibilidade de conexão usando códigos conhecidos do Supabase, sem mostrar mensagens brutas do provedor. Uma falha na recuperação inicial da sessão mantém a interface privada bloqueada e libera os controles para nova entrada quando o cliente está configurado.
