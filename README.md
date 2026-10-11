# Jarvis — online e Windows

Assistente pessoal para conversar sobre estudos e projetos, guardar notas e organizar tarefas. Este repositório reúne o painel online com Supabase, a fila para Antigravity no Windows e a versão local com cofre Markdown compatível com Obsidian.

Repositório público: [Henrique1601/jarvis](https://github.com/Henrique1601/jarvis), com as aplicações Windows e web na branch `main`.

Aplicação publicada: [abrir Jarvis online](https://jarvis-ten-pi-14.vercel.app/). Crie sua conta com o e-mail autorizado e confirme o e-mail antes de entrar. Memória e tarefas não dependem da IA. Em 10/10/2026, o proprietário autorizou ferramentas do Antigravity e uma resposta direta autenticada foi validada. O site usa uma fila; o componente Windows precisa conectar a conta para processá-la.

## Duas aplicações, dados separados

| Aplicação | Como funciona | Situação |
| --- | --- | --- |
| Web em `cloud/` | Frontend e API na Vercel; autenticação, dados e fila Supabase; respostas por componente Windows | Fila publicada; conexão do dispositivo Windows necessária |
| Windows em `jarvis-gemini/` | Python, painel local, arquivos Markdown, tarefas, histórico e backup | Código fonte atualizado; resposta direta Antigravity autenticada validada |

A versão web usa banco remoto. A versão Windows conserva o cofre e o estado no computador. **Sincronização entre as duas versões ainda não foi implementada.** Publicar o repositório ou o site não envia automaticamente o cofre do PC para a nuvem.

## Usar a versão web

A aplicação web usa autenticação e dados reais. Confira [configuração e deploy](cloud/README.md) e [Antigravity no Windows](cloud/ANTIGRAVITY-WINDOWS.md). Pedidos podem aguardar até sete dias, com até cinco pendentes por conta. O computador consulta a fila por HTTPS; nenhuma porta pública ou túnel é necessário.

O acesso às APIs privadas exige sessão Supabase, email confirmado e presença em `ALLOWED_EMAILS`. A lista administrativa do banco também precisa conter os mesmos emails; RLS e RPCs restringem os registros ao proprietário autorizado. O componente Windows exige sessão da conta e credencial revogável de dispositivo, protegidas pelo Windows. Senha, tokens e segredos não entram no repositório nem na conversa. Código público não torna os dados dos usuários públicos.

A IA proposta utiliza o login Google oficial do Antigravity e os limites do plano da conta. Não habilita gastos adicionais nem fallback para Gemini API automaticamente. Somente notas, tarefas e conversa online são usadas no contexto; o cofre Windows permanece separado.

## Jarvis para Windows

Abra [o guia Windows](jarvis-gemini/README.md). `INICIAR.bat` abre o painel em `http://127.0.0.1:8765`; o cofre, tarefas, edição com conflito, histórico, restauração e backup permanecem locais.

A instalação atual prepara Antigravity CLI 1.3.3. A política autorizada aceita suas ferramentas e mantém as permissões normais do CLI. O worker online usa workspace separado por execução e prepara contexto sem ler o cofre local; isso não impede acesso de ferramentas nativas a arquivos. Consulte [a mudança e o diagnóstico](jarvis-gemini/DIAGNOSTICO-ANTIGRAVITY.md). Executáveis e ZIPs antigos mantêm a política anterior até serem reconstruídos.

Whisper/transcrição e SAPI/leitura reais ainda dependem de validação no Windows. A web não herda automaticamente o áudio, o executável ou os arquivos do PC.

## Estrutura

- `cloud/`: aplicação web, API e configuração do banco.
- `jarvis-gemini/`: serviço Windows, painel local, testes e guias Obsidian.
- `AGENTS.md` e `EQUIPE-JARVIS.md`: orientação e histórico da equipe de desenvolvimento.

Credenciais, cofre de uso, histórico pessoal, dependências, backups e binários não fazem parte do código público. O contexto pessoal `CONVERSA-JARVIS.md` permanece fora da publicação.

## Verificação e publicação

Na implementação 0.6, passaram 66 testes cloud (29 de backend e 37 de frontend/build), o build e 65 testes Windows. A migração aditiva `jarvis_cloud_v2_antigravity_queue` foi aplicada no Supabase com execução desativada; a verificação transacional real da fila passou com rollback e preservou os dados anteriores. A versão foi publicada na Vercel; envio, posição, prazo de sete dias, recarga e cancelamento foram verificados pela interface autenticada. [Os dois jobs de CI passaram](https://github.com/Henrique1601/jarvis/actions/runs/38082121979) para `d95315d`. Os resultados Windows estão em [VALIDACAO.md](jarvis-gemini/VALIDACAO.md). A execução Antigravity permanece bloqueada pela restrição de ferramentas; resposta real e retomada após reinício ainda não foram validadas.

A versão 0.5 anterior teve 42 testes Windows e 37 testes web aprovados, schema básico aplicado e isolamento RLS/RPC verificado em transações revertidas. Login e persistência pela interface publicada confirmaram sessão após recarga, criação/edição/restauração de nota e tarefa concluída. O deployment do commit `3ad639c` ficou `READY` e [os dois jobs de CI passaram](https://github.com/Henrique1601/jarvis/actions/runs/38058458715). Esses resultados são históricos e não comprovam a entrega da fila 0.6. O [registro completo](cloud/README.md) preserva as evidências anteriores.

O [workflow CI](.github/workflows/ci.yml) executa Python 3.14 no Windows e testes/build Node.js 24 no Ubuntu, sem credenciais reais. A Vercel usa Root Directory `cloud`; o Supabase existente fica em São Paulo. A configuração e os critérios da fila estão em [cloud/README.md](cloud/README.md). O provedor atual proposto é Antigravity no Windows, sem exigência de chave Gemini nem fallback automático. Memória e tarefas continuam independentes da IA e o cofre local não é enviado automaticamente à nuvem.
