# Jarvis web 0.5.0 — Supabase e Gemini API

Aplicação online com autenticação e persistência por usuário no Supabase e respostas pela Gemini API no servidor. O destino do frontend e da API é Vercel. Esta implementação usa serviços reais; não é uma demonstração com respostas fictícias.

**Situação:** build e 15 testes locais do backend aprovados; projetos remotos criados. Schema/RLS real, login, isolamento entre contas, resposta Gemini e deploy ainda não foram confirmados. A chave Gemini permanece pendente de inserção segura pelo usuário.

## Arquitetura e dados

O navegador autentica o usuário com Supabase. A API valida o Bearer token em `/auth/v1/user`, exige email confirmado e listado em `ALLOWED_EMAILS`, recusa contas anônimas e opera com as permissões da sessão. Notas, tarefas, mensagens e os demais registros implementados ficam no Supabase, separados do cofre Windows.

A Gemini API recebe somente o contexto montado pelo serviço. A chave de API permanece no servidor. Não há execução do Antigravity CLI, acesso ao disco do PC ou necessidade de login Antigravity na web. O handler é `api/index.mjs`; as regras de HTTP, Supabase, contexto e Gemini ficam em `lib/` e a migração em `supabase/schema.sql`. A integração final ainda está em verificação.

RLS e RPCs transacionais exigem proprietário autenticado e presença na lista administrativa `jarvis_allowed_emails`, que não concede leitura/escrita ao cliente. Essa lista deve coincidir com `ALLOWED_EMAILS` no servidor. O código público não concede leitura pública dos dados. Não use chave `service_role` para substituir a sessão: ela ignora RLS. Referência: [políticas e privilégios Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Configurar Supabase

1. O projeto desta aplicação já foi criado em São Paulo: referência `jsyihprjzjjcjgpgnfrt`. Confira esse destino antes de aplicar o SQL; projeto criado não significa schema aplicado.
2. No SQL Editor, revise e aplique integralmente `cloud/supabase/schema.sql`. O script contém as tabelas, RLS e funções RPC transacionais da aplicação.
3. Confira RLS e privilégios: usuário anônimo não deve acessar dados privados; uma conta não deve acessar registros de outra.
4. Prepare as contas permitidas em Supabase Auth, com email confirmado. Pelo SQL Editor administrativo, insira os emails autorizados em `public.jarvis_allowed_emails`, em minúsculas, e mantenha os mesmos emails em `ALLOWED_EMAILS` no servidor. O navegador não pode escrever nessa tabela. Uma conta criada pelo botão de cadastro não ganha acesso automaticamente.
5. Cadastre a URL final da aplicação como Site URL e os retornos necessários em Redirect URLs; previews e localhost têm URLs próprias. Veja [URLs de autenticação](https://supabase.com/docs/guides/auth/redirect-urls).
6. Obtenha a URL e a chave pública compatível com `SUPABASE_ANON_KEY` na interface Supabase. Não cole senha de banco, tokens ou chaves de serviço no chat.

Uma migração salva no repositório não significa que o banco real foi preparado. Aplicação do SQL, política RLS e duas contas de teste precisam de evidência própria.

Exemplo administrativo, com placeholder para preencher apenas na interface Supabase:

```sql
insert into public.jarvis_allowed_emails (email)
values ('seu-email-autorizado@example.com')
on conflict (email) do nothing;
```

Não publique a lista real em exemplos, commits ou no chat. Retirar acesso exige manter a tabela e `ALLOWED_EMAILS` em sincronia.

## Variáveis do servidor

Supabase e allowlist são necessários para usar os dados. As variáveis Gemini são necessárias para conversar; memória e tarefas não dependem da chave Gemini.

| Nome | Conteúdo | Local |
| --- | --- | --- |
| `SUPABASE_URL` | URL do projeto Supabase | Configuração do servidor |
| `SUPABASE_ANON_KEY` | Chave pública `anon` do projeto; acesso continua condicionado à sessão e RLS | Configuração do servidor; somente configuração pública necessária chega ao frontend |
| `ALLOWED_EMAILS` | Emails autorizados, separados por vírgula; cada conta precisa ter email confirmado | Configuração somente do servidor |
| `GEMINI_API_KEY` | Chave Gemini API criada na interface apropriada | Segredo somente do servidor |
| `GEMINI_MODEL` | Modelo configurado: `gemini-3.5-flash-lite`; disponibilidade real ainda depende de teste com a chave | Configuração do servidor |

Use os campos de Environment Variables da Vercel para inserir valores, com os ambientes corretos. **Digite a chave Gemini diretamente na interface segura, sem enviá-la na conversa.** Não use prefixo público de frontend para essa chave e não a inclua no bundle, em logs, exemplos preenchidos ou commits. `GET /api/config` pode fornecer somente URL e chave pública Supabase, sem chave Gemini nem allowlist. O arquivo de exemplo contém apenas placeholders. Veja [variáveis Vercel](https://vercel.com/docs/environment-variables) e [chaves Gemini API](https://ai.google.dev/gemini-api/docs/api-key).

Para desenvolvimento local, use um arquivo de ambiente ignorado pelo Git e nunca o publique. Nenhum segredo real é fornecido neste guia.

## Gemini API: acesso e quotas

Google AI Pro e chamada programática por API são produtos distintos. A API tem condições próprias de acesso, quotas e cobrança, incluindo Free Tier elegível e tiers pagos. Não há promessa de uso ilimitado nem de que a assinatura cubra as chamadas. Confira [Google AI plans e API programática](https://ai.google.dev/gemini-api/docs/google-ai-plans) e [billing Gemini API](https://ai.google.dev/gemini-api/docs/billing).

Confirme acesso ao modelo configurado; não presuma disponibilidade apenas pelo nome. A aplicação reserva no banco até 20 tentativas de chat por usuário por hora antes de chamar a API; falhas após a reserva também podem consumir essa cota. Essa proteção não substitui as quotas e limites financeiros do provedor. A verificação real exige chave segura e solicitação autenticada.

## Desenvolvimento e checks

Use Node.js 24. Na pasta `cloud/`:

```powershell
npm ci
npm test
npm run build
```

O script de testes usa `node --test tests/*.mjs`; o build executa `node build.mjs` e gera `public/`. O build copia uma lista explícita de assets compartilhados de `../jarvis-gemini/web/`, sem copiar o cofre ou dados de uso. Os resultados locais e remotos são registrados abaixo.

Os testes Windows continuam independentes, executados em `jarvis-gemini/`:

```powershell
py -3 -m unittest discover -s tests -v
```

Não declare a web validada apenas porque a suíte Windows passou. Antes de publicar, verificar frontend, API, tratamento de erros, autenticação, persistência após recarregar e acesso entre dois usuários distintos. O [CI](../.github/workflows/ci.yml) roda testes locais sem credenciais; ele não aplica SQL nem testa Supabase/Gemini reais.

## Deploy na Vercel

1. O repositório público [Henrique1601/jarvis](https://github.com/Henrique1601/jarvis) e o projeto Vercel `prj_emYK9JO8g3C20VgvSJoIYwlAKPna` já foram preparados; o deploy desta entrega ainda precisa ser confirmado.
2. Defina **Root Directory: `cloud`**, não a raiz do serviço Windows. Use Node.js 24.
3. A configuração `cloud/vercel.json` usa preset Other (`framework: null`), Build Command `npm run build` e Output Directory `public`; encaminha `/api/*` ao handler `api/index.mjs`, preservando a rota. Habilite **Include source files outside of the Root Directory**: o build usa os assets de `jarvis-gemini/web/`. Essa opção já foi habilitada no projeto preparado. O build não copia `jarvis-gemini/data`.
4. Cadastre as cinco variáveis acima pela interface e mantenha `GEMINI_API_KEY` somente no servidor. Configure Production/Preview conforme o uso; alterações de ambiente requerem novo deployment.
5. Prepare o schema e Auth do Supabase e cadastre os retornos da URL escolhida.
6. Execute preview, confira os fluxos abaixo e só então registre o endereço de produção.

Não há túnel para o computador Windows nesta arquitetura. O serviço local permanece em `127.0.0.1` e o cofre pessoal não é importado automaticamente.

## Critérios de aceite

- Build e testes da web aprovados, sem segredo no bundle ou no histórico Git.
- Login, logout e sessão inválida com comportamento verificado; APIs privadas recusam usuário anônimo.
- Notas e tarefas persistidas no Supabase e recuperadas após recarregar.
- Duas contas de teste não acessam nem modificam os registros uma da outra, inclusive por chamada direta ao banco/API.
- Resposta real da Gemini API com a origem das notas enviadas; falhas de quota/conexão não geram resposta fictícia.
- URL HTTPS e assets/API verificados no deploy; status técnico e pendências registrados.

## Registro de validação

| Verificação | Resultado |
| --- | --- |
| Testes do backend web | 15 aprovados após os ajustes de autorização, limites e deadline; serviços simulados |
| Build do frontend | `npm ci` e `npm run build` aprovados; auditoria reportou zero vulnerabilidades conhecidas |
| Suíte Windows nesta alteração | 42 testes aprovados |
| Schema/RLS aplicado no projeto Supabase real | Pendente |
| Login e isolamento entre duas contas reais | Pendente |
| Resposta autenticada Gemini API | Pendente de configuração segura e teste real |
| GitHub | Repositório público criado; base `61d0850` publicada em `main`; entrega web pendente de publicação |
| Vercel | Projeto preparado com raiz `cloud`; deploy e URL HTTPS pendentes |

Resultados locais com mocks, configuração remota e jornadas autenticadas são registrados separadamente. O CI possui dois jobs de até dez minutos, acesso `contents: read` e actions fixadas em SHAs verificados. Executa em push para `main` e pull requests; sua execução no GitHub ainda precisa ser observada.

## Relação com o Windows

O código-fonte Windows continua em `jarvis-gemini/`, com prévia 0.4.0 e conversa Antigravity bloqueada pela lista real de ferramentas. O modelo de dados da web é separado. **Sincronização, importação automática do cofre e compartilhamento do login não foram implementados.** Áudio Whisper/SAPI do Windows também não integra esta entrega web automaticamente.
