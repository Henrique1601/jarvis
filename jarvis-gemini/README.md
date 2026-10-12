# Jarvis 0.4.0 — prévia Antigravity no Windows

Assistente de Henrique com painel local, memória Markdown/Obsidian, tarefas e voz opcional. O código fonte atual aceita ferramentas do Antigravity por autorização do proprietário em 10/10/2026. Uma resposta direta autenticada foi validada com o CLI 1.3.3; o componente online ainda exige conexão da conta Supabase. Os registros da prévia 0.4 abaixo são históricos, e seus executáveis não incorporam essa alteração.

## Começar

1. Execute **CONFIGURAR-ANTIGRAVITY.bat** para preparar o CLI local. O fluxo oferece login pelo navegador; digite credenciais apenas na interface Google. O Antigravity CLI fica em `.tools/antigravity/agy.exe`, sem exigir Node.js. **CONFIGURAR-GEMINI.bat** encaminha para o novo script.
2. Execute **INICIAR.bat** (navegador padrão) ou **INICIAR-APP.bat** (janela desktop dedicada `--app-window` via Edge/Chrome). O painel abre em http://127.0.0.1:8765. Requer Python 3.11+. O serviço foi testado com Python 3.14 no Windows.
3. Abra **Verificar instalação** e use o teste de conexão Antigravity. Esse botão solicita uma resposta real e pode consumir sua cota. Encontrar o CLI não confirma o login nem a lista real de ferramentas permitidas.
4. Abra `data/vault` como cofre no Obsidian e comece por `wiki/cerebro-jarvis.md`.

A integração local envia pedido, trechos de notas, tarefas e mensagens recentes ao Antigravity. O worker online usa somente o contexto online preparado no servidor. Nenhuma chave de API é usada; autenticação e cotas continuam necessárias. Ferramentas seguem as permissões normais do CLI; o workspace separado não é sandbox de arquivos. Para conectar a fila, use **CONFIGURAR-WORKER.bat**.

## Prévia 0.4.0 — migração não concluída

O Google encerrou o acesso de contas individuais, Google AI Pro e Ultra pelo login Google do Gemini CLI em 18 de junho de 2026 e orienta a migração para Antigravity. Veja o [aviso oficial](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals).

O CLI nativo 1.3.2 foi instalado localmente com SHA-512 verificado. A instalação não modifica PATH, aliases nem configurações globais. Não é instalado SDK e não é solicitada chave de API.

A integração pretende oferecer conversa somente texto. O perfil local `jarvis-chat` declara `tools: []` e comandos desativados, mas o probe do CLI real 1.3.2 retornou cerca de 59 ferramentas, incluindo comandos, arquivos, web, navegador, MCP e mensagens. O runtime confirmou o nome do agente e bloqueou a sessão antes de enviar pedido ou notas porque `init.tools` não estava vazio. **A conversa não está pronta; fazer login sozinho não resolve esse bloqueio.** Não foi demonstrada uma restrição efetiva das ferramentas nesta versão do CLI.

Os 42 testes locais passaram; JavaScript, sintaxe Python, instalação nova com download/SHA-512, build e smoke HTTP do executável 0.4.0 foram aprovados. A tentativa de allowlist também manteve as ferramentas anunciadas, sem solução efetiva observada no CLI 1.3.2. Esses checks não demonstram permissões adequadas ou resposta autenticada. Login e áudio reais continuam pendentes. Veja [VALIDACAO.md](VALIDACAO.md).

Pacotes desta etapa: `Jarvis-Gemini-0.4-Previa-Codigo.zip` e `Jarvis-Gemini-0.4-Previa-Windows.zip`, com hashes em `SHA256SUMS.txt`. São uma prévia local para revisão, não uma migração pronta ou publicação externa.

Guia: [Jarvis 0.4](vault/wiki/jarvis-versao-0.4.md). As funcionalidades e o orçamento de contexto da versão 0.3 são preservados. Os arquivos históricos de versões anteriores continuam descrevendo seus respectivos provedores.

## Base preservada da versão 0.3.0

A versão 0.3 melhorou a recuperação de evidências em notas longas e o tratamento de falhas do CLI. Seus 32 testes e executável foram verificados localmente; esses resultados são históricos e não validam o novo provedor. Veja [VALIDACAO.md](VALIDACAO.md).

- Seleção de trechos relacionados ao pedido em notas longas, com arquivo, posições e linhas de origem, incluindo evidências após os primeiros 20.000 caracteres.
- Orçamento de 32.000 caracteres para o prompt completo, contando instruções, JSON serializado e pedido. Pedidos aceitos de até 12.000 caracteres são preservados integralmente.
- Validação do formato da resposta do CLI e tratamento de timeout, erros e liberação dos locks em pedidos concorrentes.

O contexto prioriza notas, depois tarefas e histórico. Inclui até seis notas com até três trechos de 1.000 caracteres cada; até cinquenta tarefas com textos de 300 caracteres; e até dez mensagens, usando no máximo os 2.000 caracteres finais de cada uma. Esses tetos podem ser reduzidos para respeitar o orçamento total. A seleção não reduz as notas, tarefas ou mensagens salvas. A lista de fontes corresponde às notas efetivamente enviadas.

Guia da entrega: [Jarvis 0.3](vault/wiki/jarvis-versao-0.3.md). Estes itens não instalam perfis de agentes nem novas ferramentas no aplicativo.

## Recursos preservados da versão 0.2

- Diagnóstico de instalação e compatibilidade, atualizado para o novo CLI na 0.4.
- Edição do Markdown completo com histórico e restauração de versões.
- Proteção contra sobrescrever alterações feitas no Obsidian desde a abertura da nota.
- Backup ZIP do cofre, conversa, tarefas e histórico.
- Importação dos guias sem substituir arquivos existentes.
- Busca por palavras completas, sem acentos, com mais peso para títulos.
- Lista das notas enviadas como contexto em novas respostas. Essa lista não garante que o modelo tenha usado todas as notas.

## Dados

`INICIAR.bat` usa a pasta `data` deste projeto. O painel mostra o caminho exato. O servidor iniciado manualmente sem `--data-dir` mantém o padrão anterior: `%LOCALAPPDATA%/JarvisGemini`.

| Local | Conteúdo |
| --- | --- |
| `data/vault` | Notas Markdown e guias |
| `data/state.json` | Até 200 mensagens e tarefas |
| `data/history` | Versões anteriores das notas editadas pelo painel |
| `data/backups` | Backups criados pelo botão |
| `data/workspace` | Workspace e perfil restrito do Antigravity |

Para migrar uma instalação anterior, encerre o Jarvis, faça uma cópia dos dados e copie a pasta inteira para `data`. Guias existentes são preservados; compare atualizações com `vault/wiki` no código-fonte.

O backup inclui o cofre inteiro, histórico e estado. Não inclui o login Google nem dependências. Copie o ZIP para outro disco para proteger contra falha do PC. Para restaurar um backup completo, encerre o serviço, preserve uma cópia dos dados atuais, extraia o ZIP em uma pasta separada e inicie com `--data-dir` apontando para ela. Não extraia sobre dados ativos.

```powershell
py -3 server.py --data-dir "D:/JarvisRestaurado"
```

O histórico registra edições feitas pelo painel. Alterações diretas no Obsidian são capturadas na próxima edição pelo Jarvis ou em backup. Se houver conflito, seu rascunho fica no editor; copie-o e reabra a nota para conferir a versão atual.

## Voz e executável

`INSTALAR-VOZ.bat` prepara Whisper para o código-fonte. Recomenda-se Python 3.12, 64 bits, para as dependências de áudio. O primeiro uso baixa Whisper base. **Falar** transcreve para a caixa de mensagem; confira antes de enviar. **Ouvir** usa vozes SAPI do Windows.

`GERAR-EXE.bat` gera `dist/JarvisGemini/JarvisGemini.exe`. A compilação padrão inclui texto e leitura SAPI; transcrição por microfone fica disponível pelo código-fonte com as dependências opcionais. O executável abre o navegador; uma janela desktop independente continua planejada.

Mantenha toda a pasta `dist/JarvisGemini`. Use `CONFIGURAR-ANTIGRAVITY.bat` dessa pasta para preparar o CLI; Node.js não é requisito em produção. Por compatibilidade, o nome do executável e o caminho padrão de dados `%LOCALAPPDATA%/JarvisGemini` são preservados. Use `--data-dir` para compartilhar os dados da versão fonte. O build 0.4.0 foi verificado localmente; a conversa permanece bloqueada pelo conjunto de ferramentas anunciado pelo CLI real.

## Verificação e próximos passos

```powershell
py -3 -m unittest discover -s tests -v
node --check web/app.js
node --check web/workspace.js
```

Os testes exercitam memória, API, origem/token, conflitos, histórico, restauração, backup, importação e integração CLI simulada. Node.js é usado nos comandos de verificação do JavaScript acima, não pelo Antigravity em produção. Login Antigravity, confirmação real das ferramentas e áudio requerem validação pelo usuário. Não há respostas simuladas no aplicativo.

Próximo gate: demonstrar isolamento e controle efetivo das ferramentas no CLI real antes de habilitar conversa. A alternativa é uma API de texto com chave e regras próprias de quota/cobrança, após escolha do usuário; pode haver Free Tier elegível e tiers pagos. A API programática é [separada da assinatura Google AI Pro](https://ai.google.dev/gemini-api/docs/google-ai-plans#limitations-and-compatibility); confira [acesso e cobrança da Gemini API](https://ai.google.dev/gemini-api/docs/billing). Nenhuma API foi configurada nesta entrega. Depois validar resposta e áudio. Perfis Supremo, novas ferramentas, busca semântica e integrações continuam planejados. A validação local não confirma outro PC nem publicação externa.

## Referências oficiais

- [Encerramento do acesso individual pelo Gemini CLI](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals)
- [Migração para Antigravity CLI](https://antigravity.google/docs/cli/gcli-migration)
- [Planos e cotas Antigravity](https://antigravity.google/pricing)
- [Google AI Pro e uso programático da API](https://ai.google.dev/gemini-api/docs/google-ai-plans)
- [Whisper local](https://github.com/SYSTRAN/faster-whisper)

`server.py` coordena serviço e CLI; `web` contém o painel; `vault/wiki` contém os guias; `tests` contém os testes sem conta Google.
