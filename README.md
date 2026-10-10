# Jarvis — online e Windows

Assistente pessoal para conversar sobre estudos e projetos, guardar notas e organizar tarefas. Este repositório reúne a nova aplicação web com Supabase e Gemini API e a versão local para Windows com cofre Markdown compatível com Obsidian.

Repositório público: [Henrique1601/jarvis](https://github.com/Henrique1601/jarvis). A base Windows está publicada na branch `main`; a entrega web será registrada após os checks finais.

## Duas aplicações, dados separados

| Aplicação | Como funciona | Situação |
| --- | --- | --- |
| Web 0.5.0 em `cloud/` | Frontend e API na Vercel; autenticação e banco Supabase; Gemini API no servidor | Build e 15 testes locais aprovados; schema real, login, Gemini e deploy ainda pendentes |
| Windows em `jarvis-gemini/` | Python, painel local, arquivos Markdown, tarefas, histórico e backup | Prévia 0.4.0; recursos locais disponíveis, conversa Antigravity bloqueada |

A versão web usa banco remoto. A versão Windows conserva o cofre e o estado no computador. **Sincronização entre as duas versões ainda não foi implementada.** Publicar o repositório ou o site não envia automaticamente o cofre do PC para a nuvem.

## Usar a versão web

A aplicação web é uma implementação com autenticação, persistência e IA por API; não substitui o backend por respostas demonstrativas. Confira [configuração e deploy](cloud/README.md) para preparar Supabase, Gemini API e Vercel.

O acesso às APIs privadas exige sessão Supabase, email confirmado e presença em `ALLOWED_EMAILS`. A lista administrativa do banco também precisa conter os mesmos emails; RLS e RPCs restringem os registros ao proprietário autorizado. A chave Gemini fica no servidor; senha, tokens de sessão e segredos não entram no repositório nem na conversa. Código público não torna os dados dos usuários públicos.

O modelo e o acesso à Gemini API são configurados separadamente da assinatura Google AI Pro. Há regras próprias de quota, Free Tier elegível e tiers pagos; confira a [documentação de acesso e cobrança](https://ai.google.dev/gemini-api/docs/billing) antes de habilitar uso real.

## Jarvis para Windows

Abra [o guia Windows](jarvis-gemini/README.md). `INICIAR.bat` abre o painel em `http://127.0.0.1:8765`; o cofre, tarefas, edição com conflito, histórico, restauração e backup permanecem locais.

A prévia 0.4.0 prepara Antigravity CLI 1.3.2, mas **a conversa está bloqueada antes de enviar pedido e notas**: o CLI real anunciou ferramentas apesar do perfil `tools: []`. Fazer login sozinho não resolve esse bloqueio. A nova integração web com Gemini API não altera essa implementação local nem usa seu login Antigravity.

Whisper/transcrição e SAPI/leitura reais ainda dependem de validação no Windows. A web não herda automaticamente o áudio, o executável ou os arquivos do PC.

## Estrutura

- `cloud/`: aplicação web, API e configuração do banco.
- `jarvis-gemini/`: serviço Windows, painel local, testes e guias Obsidian.
- `AGENTS.md` e `EQUIPE-JARVIS.md`: orientação e histórico da equipe de desenvolvimento.

Credenciais, cofre de uso, histórico pessoal, dependências, backups e binários não fazem parte do código público. O contexto pessoal `CONVERSA-JARVIS.md` permanece fora da publicação.

## Verificação e publicação

Os 42 testes Windows e os 15 testes do backend web passaram nesta alteração. O build web com `npm ci` e `npm run build` passou, com auditoria de dependências sem vulnerabilidades conhecidas reportadas. Os testes do backend usam serviços simulados; banco real, autenticação, persistência, isolamento e resposta Gemini exigem verificações próprias. Os resultados históricos Windows estão em [VALIDACAO.md](jarvis-gemini/VALIDACAO.md).

O [workflow CI](.github/workflows/ci.yml) executa a suíte Python 3.14 no Windows e testes/build Node.js 24 no Ubuntu em push para `main` e pull requests. As actions usam SHAs verificados e permissão somente de leitura do código. Criar o workflow não confirma que houve execução bem-sucedida no GitHub; os testes não usam credenciais reais.

O projeto Vercel usa Root Directory `cloud`; o projeto Supabase foi criado em São Paulo. A configuração e os passos para schema, allowlists e segredos pela interface estão em [cloud/README.md](cloud/README.md). A chave Gemini permanece pendente de inserção segura pelo usuário. O endereço e as verificações do deploy serão registrados após publicação; status pronto não confirma sozinho as jornadas autenticadas.
