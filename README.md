# Jarvis — online e Windows

Assistente pessoal para conversar sobre estudos e projetos, guardar notas e organizar tarefas. Este repositório reúne a nova aplicação web com Supabase e Gemini API e a versão local para Windows com cofre Markdown compatível com Obsidian.

Repositório público: [Henrique1601/jarvis](https://github.com/Henrique1601/jarvis), com as aplicações Windows e web na branch `main`.

Aplicação publicada: [abrir Jarvis online](https://jarvis-ten-pi-14.vercel.app/). Crie sua conta com o e-mail autorizado e confirme o e-mail antes de entrar. A chave Gemini será configurada depois; memória e tarefas não dependem dela.

## Duas aplicações, dados separados

| Aplicação | Como funciona | Situação |
| --- | --- | --- |
| Web 0.5.0 em `cloud/` | Frontend e API na Vercel; autenticação e banco Supabase; Gemini API no servidor | Publicada; conta confirmada; validação da sessão corrigida em andamento e IA aguardando chave |
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

Os 42 testes Windows e os 37 testes web (15 de backend e 22 de frontend) passaram nesta alteração. O build web com `npm ci` e `npm run build` passou, com auditoria de dependências sem vulnerabilidades conhecidas reportadas. O schema foi aplicado no Supabase real e testes transacionais com três usuários sintéticos, revertidos ao terminar, verificaram conflitos, histórico, tarefas, chat atômico, quotas, backup e isolamento RLS/RPC. Login pela interface, persistência pela aplicação publicada e resposta Gemini ainda exigem verificações próprias. Os resultados históricos Windows estão em [VALIDACAO.md](jarvis-gemini/VALIDACAO.md).

O [workflow CI](.github/workflows/ci.yml) executa a suíte Python 3.14 no Windows e testes/build Node.js 24 no Ubuntu em push para `main` e pull requests. As actions usam SHAs verificados e permissão somente de leitura do código. [Os dois jobs passaram no GitHub](https://github.com/Henrique1601/jarvis/actions/runs/38057834023) para o commit `c38746a`; os testes não usam credenciais reais.

O projeto Vercel usa Root Directory `cloud`; o projeto Supabase foi criado em São Paulo, com schema e allowlist administrativa preparados. A configuração está em [cloud/README.md](cloud/README.md). O usuário escolheu configurar a IA depois: memória e tarefas não exigem chave Gemini; conversa requer essa configuração. O deployment de produção do commit `c38746a` ficou `READY`; o domínio principal disponibiliza o painel, assets JavaScript, configuração pública e health, e `/api/state` sem sessão recusa acesso com 401. O retorno de autenticação Supabase foi configurado para esse domínio. A conta foi criada e o e-mail confirmado pelo usuário; a validação de login e persistência pela interface continua após a correção da sessão entre abas.
