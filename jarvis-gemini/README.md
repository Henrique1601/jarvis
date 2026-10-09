# Jarvis Gemini 0.3.0 — Windows

Assistente de Henrique com painel local, Gemini CLI, memória Markdown/Obsidian, tarefas e voz opcional. A primeira versão foi recuperada do histórico e continuada neste workspace.

## Começar

1. Execute **CONFIGURAR-GEMINI.bat**, escolha **Login with Google** e entre com sua conta. Teste uma pergunta e saia com `/quit`. O CLI 0.63.0 fica em `.tools` dentro do projeto, sem instalação global. Requer Node.js 20+.
2. Execute **INICIAR.bat**. O painel abre em http://127.0.0.1:8765. Requer Python 3.11+. O serviço foi testado com Python 3.14 no Windows.
3. Abra **Verificar instalação** e use **Testar conexão Gemini**. Esse botão faz uma solicitação real e pode consumir sua cota. Encontrar o CLI não confirma o login.
4. Abra `data/vault` como cofre no Obsidian e comece por `wiki/cerebro-jarvis.md`.

Gemini recebe o pedido, trechos das notas recuperadas, tarefas e mensagens recentes. As notas ficam no PC. Não é necessário fornecer chave de API ao Jarvis. Benefícios e cotas seguem sua conta Google.

## Novidades da versão 0.3.0

Esta entrega melhora a recuperação de evidências em notas longas, limita o contexto enviado ao Gemini e trata falhas do CLI. Os 32 testes do serviço passaram no Windows; JavaScript, sintaxe Python e o executável 0.3.0 foram verificados localmente. Veja [VALIDACAO.md](VALIDACAO.md). A conversa autenticada com Google e a voz real continuam pendentes.

- Seleção de trechos relacionados ao pedido em notas longas, com arquivo, posições e linhas de origem, incluindo evidências após os primeiros 20.000 caracteres.
- Orçamento de 32.000 caracteres para o prompt completo, contando instruções, JSON serializado e pedido. Pedidos aceitos de até 12.000 caracteres são preservados integralmente.
- Validação do formato da resposta do CLI e tratamento de timeout, erros e liberação dos locks em pedidos concorrentes.

O contexto prioriza notas, depois tarefas e histórico. Inclui até seis notas com até três trechos de 1.000 caracteres cada; até cinquenta tarefas com textos de 300 caracteres; e até dez mensagens, usando no máximo os 2.000 caracteres finais de cada uma. Esses tetos podem ser reduzidos para respeitar o orçamento total. A seleção não reduz as notas, tarefas ou mensagens salvas. A lista de fontes corresponde às notas efetivamente enviadas.

Guia da entrega: [Jarvis 0.3](vault/wiki/jarvis-versao-0.3.md). Estes itens não instalam perfis de agentes nem novas ferramentas no aplicativo.

## Novidades da versão 0.2

- Diagnóstico de Python, Node.js, CLI e compatibilidade.
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
| `data/workspace` | Política de ferramentas do Gemini |

Para migrar uma instalação anterior, encerre o Jarvis, faça uma cópia dos dados e copie a pasta inteira para `data`. Guias existentes são preservados; compare atualizações com `vault/wiki` no código-fonte.

O backup inclui o cofre inteiro, histórico e estado. Não inclui o login Google nem dependências. Copie o ZIP para outro disco para proteger contra falha do PC. Para restaurar um backup completo, encerre o serviço, preserve uma cópia dos dados atuais, extraia o ZIP em uma pasta separada e inicie com `--data-dir` apontando para ela. Não extraia sobre dados ativos.

```powershell
py -3 server.py --data-dir "D:/JarvisRestaurado"
```

O histórico registra edições feitas pelo painel. Alterações diretas no Obsidian são capturadas na próxima edição pelo Jarvis ou em backup. Se houver conflito, seu rascunho fica no editor; copie-o e reabra a nota para conferir a versão atual.

## Voz e executável

`INSTALAR-VOZ.bat` prepara Whisper para o código-fonte. Recomenda-se Python 3.12, 64 bits, para as dependências de áudio. O primeiro uso baixa Whisper base. **Falar** transcreve para a caixa de mensagem; confira antes de enviar. **Ouvir** usa vozes SAPI do Windows.

`GERAR-EXE.bat` gera `dist/JarvisGemini/JarvisGemini.exe`. A compilação padrão inclui texto e leitura SAPI; transcrição por microfone fica disponível pelo código-fonte com as dependências opcionais. O executável abre o navegador; uma janela desktop independente continua planejada.

Distribua toda a pasta `dist/JarvisGemini`. Node.js continua necessário. Use `CONFIGURAR-GEMINI.bat` dessa pasta para instalar o CLI e entrar com Google. Por padrão, os dados do executável ficam em `%LOCALAPPDATA%/JarvisGemini`. Use `--data-dir` para compartilhar os dados da versão fonte.

## Verificação e próximos passos

```powershell
py -3 -m unittest discover -s tests -v
node --check web/app.js
node --check web/workspace.js
```

Os testes exercitam memória, API, origem/token, conflitos, histórico, restauração, backup, importação e integração CLI simulada. Login Gemini e microfone requerem validação pelo usuário. Não há respostas simuladas no aplicativo.

Próximas etapas: validar conversa real e áudio; depois integrar perfis e ferramentas para criar notas/tarefas pela conversa e avaliar busca semântica. CRM/Notion, agendamento, sincronização e controle de aplicativos continuam planejados. A validação local não confirma instalação em outro PC.

## Referências oficiais

- [Instalação do Gemini CLI](https://geminicli.com/docs/get-started/installation/)
- [Autenticação](https://geminicli.com/docs/get-started/authentication/)
- [Modo headless e JSON](https://geminicli.com/docs/cli/headless/)
- [Políticas de ferramentas](https://geminicli.com/docs/reference/policy-engine/)
- [Whisper local](https://github.com/SYSTRAN/faster-whisper)

`server.py` coordena serviço e CLI; `web` contém o painel; `vault/wiki` contém os guias; `tests` contém os testes sem conta Google.
