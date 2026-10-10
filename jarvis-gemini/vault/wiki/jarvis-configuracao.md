---
tags: [jarvis, windows, configuracao, obsidian, antigravity]
atualizado: 2026-10-09
---

# Jarvis — configuração no Windows

Voltar: [[cerebro-jarvis]]. Depois: [[jarvis-uso]]. Migração: [[jarvis-versao-0.4]].

## Prévia 0.4.0 — conversa bloqueada

Esta prévia prepara Antigravity CLI nativo 1.3.2; a migração não foi concluída. O login individual do Gemini CLI foi encerrado pelo Google; confira o [aviso oficial](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals). A instalação fica em `.tools/antigravity/agy.exe`, sem SDK, chave de API, alteração de PATH, aliases ou configurações globais. A conversa está bloqueada: o CLI real anuncia ferramentas apesar de `tools: []` e da tentativa de allowlist. Fazer login sozinho não resolve esse bloqueio. Veja [[jarvis-versao-0.4]].

## 1. Preparar o computador

1. Extraia todos os arquivos do ZIP em uma pasta.
2. Para usar o código-fonte, instale Python 3.11 ou superior, 64 bits. Python 3.12 é recomendado para as dependências opcionais de áudio.
3. Abra um novo terminal após instalar Python e confira:

```powershell
py -3 --version
```

O Antigravity nativo não exige Node.js nem npm. Node.js só é usado nos checks de JavaScript durante o desenvolvimento do Jarvis. O executável empacotado inclui seu runtime Python; para usá-lo, mantenha a pasta inteira e siga o script de configuração do CLI.

## 2. Entrar no Antigravity

Execute `CONFIGURAR-ANTIGRAVITY.bat`. O script prepara o CLI local e conduz o novo login no navegador. Digite senha e outros dados de acesso apenas na interface Google. `CONFIGURAR-GEMINI.bat` é um encaminhamento para o novo fluxo, não um retorno ao antigo provedor.

O Jarvis usa a autenticação do CLI, não recebe sua senha nem precisa de uma chave de API. Confira plano, disponibilidade e cotas na sua conta. Encontrar `agy.exe` não confirma que o login funciona; a autenticação antiga do Gemini também não confirma o acesso Antigravity.

## 3. Abrir o painel

Execute `INICIAR.bat` e mantenha a janela do serviço aberta. O navegador abre em:

`http://127.0.0.1:8765`

Abra **Verificar instalação** para conferir o CLI e o diagnóstico. O teste de conexão pode consumir cota quando estiver habilitado. Antes de enviar pedido/notas, o runtime exige perfil `jarvis-chat` e lista vazia de ferramentas. O probe do CLI real confirmou o nome, mas recebeu cerca de 59 ferramentas; a sessão foi bloqueada sem transmitir o prompt. A conversa continua bloqueada até corrigir e verificar a restrição no CLI real; novo login é uma pendência separada.

Para encerrar, use `Ctrl+C` na janela do serviço. Se a porta estiver ocupada, execute na pasta do projeto:

```powershell
py -3 server.py --port 8766 --data-dir data
```

Se a voz foi instalada na `.venv`, use `.\.venv\Scripts\python.exe` em vez de `py -3` nos comandos manuais.

## 4. Ativar voz

1. Encerre o Jarvis.
2. Execute `INSTALAR-VOZ.bat`.
3. Reinicie com `INICIAR.bat`.
4. Permita o microfone no navegador.
5. Clique em **Falar**, grave uma frase e pare a gravação.
6. Confira a transcrição na caixa de mensagem e clique em **Enviar**.
7. Clique em **Ouvir** na resposta para testar a voz do Windows.

A primeira transcrição baixa Whisper base e exige internet. Depois, a transcrição é local. A leitura depende das vozes SAPI instaladas; sem voz pt-BR, o serviço usa a padrão. Ainda não há palavra de ativação ou escuta contínua. Transcrição e reprodução reais continuam pendentes de validação no PC.

## 5. Abrir o cérebro no Obsidian

Depois de iniciar o Jarvis uma vez:

1. No painel, expanda **Configuração e dados** e copie o caminho do cofre.
2. No Obsidian, abra uma pasta existente como cofre.
3. Selecione a pasta `vault` mostrada no painel. Com `INICIAR.bat`, ela fica em `data\vault` no projeto. O executável sem `--data-dir` usa `%LOCALAPPDATA%\JarvisGemini\vault`.
4. Abra `wiki/cerebro-jarvis.md`.

Não é necessário plugin do Obsidian para as notas serem lidas. A pasta `vault` do ZIP contém modelos de documentação; o cofre diário fica na pasta de dados.

### Atualizar guias de uma instalação anterior

O serviço copia guias ausentes, sem sobrescrever notas existentes. Use **Adicionar guias do Jarvis** para importar os novos guias. Para atualizar guias que já existam, compare manualmente `vault/wiki` do código-fonte com o cofre de uso, começando por:

- `cerebro-jarvis.md`
- `jarvis-configuracao.md`
- `jarvis-atualizacoes.md`
- `jarvis-versao-0.4.md`
- `boas-vindas.md`

Preserve alterações pessoais, outras notas e `state.json`. A importação não substitui um guia antigo editado por você. O Jarvis relê as notas na próxima busca ou mensagem; atualize o painel para ver a lista.

### Usar outra pasta de dados

```powershell
py -3 server.py --data-dir "D:\JarvisDados"
```

O cofre será `D:\JarvisDados\vault`. O comando muda a raiz de todos os dados; não aponta diretamente para um cofre preexistente e não migra arquivos antigos. Para mudar de local, encerre o serviço e copie os dados preservando a estrutura.

## 6. Gerar o executável

Execute `GERAR-EXE.bat` no Windows. O resultado esperado continua sendo `dist\JarvisGemini\JarvisGemini.exe`; o nome e o caminho de dados anteriores são mantidos por compatibilidade. Mantenha a pasta inteira e execute seu `CONFIGURAR-ANTIGRAVITY.bat` para preparar o CLI e entrar com Google. Não exige Node.js para uso do Antigravity nativo.

A compilação padrão inclui texto e leitura SAPI; microfone fica disponível pelo código-fonte com dependências opcionais. Build e smoke HTTP do executável 0.4.0 passaram, assim como 42 testes locais e o instalador com download/SHA-512. A conversa continua bloqueada pela divergência das ferramentas; esses checks não demonstram resposta autenticada nem instalação em outro PC.

## Problemas comuns

| Sintoma | O que conferir |
| --- | --- |
| `py` não encontrado no código-fonte | Instale Python e abra novo terminal |
| CLI não encontrado | Execute `CONFIGURAR-ANTIGRAVITY.bat` e reinicie o serviço |
| Falha de login ou cota | Faça o novo login no navegador do CLI; confira conta, internet e cotas Antigravity |
| Perfil/ferramentas não confirmados | Bloqueio conhecido no CLI 1.3.2: anúncio de ferramentas apesar de `tools: []`; não se resolve apenas fazendo login |
| Resposta demora mais de três minutos | Reduza o pedido e teste novamente |
| Microfone não transcreve | Permissão do navegador, dependências de voz e download inicial |
| Leitura sem voz em português | Confira as vozes SAPI instaladas no Windows |
| Nota não aparece no contexto | Use termos do título/conteúdo; a recuperação é parcial e tem orçamento |
| Guia ainda diz Gemini CLI | Compare o guia antigo com o código-fonte; importação preserva arquivos existentes |
| `state.json` inválido | Faça uma cópia antes de restaurar de backup |

Use **Criar backup dos dados** e guarde o ZIP em outro disco. Para restaurar, encerre o serviço, preserve uma cópia dos dados atuais, extraia em pasta separada e inicie com `--data-dir` apontando para ela. Não restaure sobre dados ativos. O backup não inclui login Google nem dependências. O painel atende somente no PC local; acesso pelo celular continua proposto.

## Referências oficiais

- [Python para Windows](https://www.python.org/downloads/windows/)
- [Encerramento do acesso individual pelo Gemini CLI](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals)
- [Migração para Antigravity CLI](https://antigravity.google/docs/cli/gcli-migration)
- [Planos e cotas Antigravity](https://antigravity.google/pricing)
- [Google AI Pro e API programática separada](https://ai.google.dev/gemini-api/docs/google-ai-plans)

Situação conferida em 09/10/2026; consulte as fontes ao atualizar o provedor. Antes de habilitar conversa, é preciso demonstrar isolamento/controle efetivo das ferramentas. Usar API de texto com chave e acesso/cobrança próprios é uma alternativa separada da assinatura Google AI Pro, sujeita à escolha do usuário.

