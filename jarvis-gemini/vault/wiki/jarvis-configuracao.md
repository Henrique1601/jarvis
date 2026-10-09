---
tags: [jarvis, windows, configuracao, obsidian]
atualizado: 2026-10-09
---

# Jarvis — configuração no Windows

Voltar: [[cerebro-jarvis]]. Depois: [[jarvis-uso]].

## Versão 0.2

Veja também [[jarvis-versao-0.2]]. O CLI 0.63.0 é instalado localmente em `.tools`. `INICIAR.bat` usa `data` dentro do projeto. O botão **Verificar instalação** confere versões e permite testar a conexão.

## 1. Preparar o computador

1. Extraia todos os arquivos do ZIP em uma pasta, como `Documentos\JarvisGemini`.
2. Instale Python 3.11 ou superior, 64 bits. Para seguir o guia inicial, use Python 3.12.
3. Instale Node.js LTS, versão 20 ou superior.
4. Abra um novo terminal depois da instalação e confira:

```powershell
py -3 --version
node --version
npm --version
```

O pacote é destinado a Windows. A documentação atual do Gemini CLI recomenda Windows 11 24H2 ou superior e requer Node.js 20 ou superior. Não foi medida a performance de áudio no seu computador.

## 2. Entrar no Gemini

Execute `CONFIGURAR-GEMINI.bat`. Se o CLI não estiver instalado, o script tenta instalar o pacote npm globalmente. Na tela do Gemini, escolha **Login with Google** e entre com a conta do seu plano Google AI Pro. Envie uma pergunta de teste; depois use `/quit`.

Alternativa manual:

```powershell
npm install --prefix .tools
.\.tools\node_modules\.bin\gemini.cmd
```

O Jarvis reaproveita a autenticação salva pelo CLI. Não precisa receber sua senha ou uma chave de API. A disponibilidade e as cotas devem ser conferidas na conta; não há promessa de uso ilimitado. O serviço remove variáveis de chave de API do processo filho para preferir o login Google.

## 3. Abrir o painel

Execute `INICIAR.bat` e mantenha a janela do serviço aberta. O navegador abre em:

`http://127.0.0.1:8765`

Envie uma mensagem curta. O indicador de CLI instalado não confirma que o login funciona. Para encerrar, use `Ctrl+C` na janela do serviço.

Se a porta estiver ocupada, abra um terminal na pasta do projeto e execute:

```powershell
py -3 server.py --port 8766
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

A primeira transcrição baixa o modelo Whisper base e exige internet. Depois, a transcrição é local. A leitura depende das vozes SAPI instaladas; se não houver voz pt-BR disponível, o serviço usa a voz padrão. Ainda não há palavra de ativação ou escuta contínua.

## 5. Abrir o cérebro no Obsidian

Depois de iniciar o Jarvis uma vez:

1. No painel, expanda **Configuração e dados** e copie o caminho do cofre.
2. No Obsidian, escolha a opção de abrir uma pasta existente como cofre.
3. Selecione a pasta `vault` mostrada no painel. Com `INICIAR.bat`, ela fica em `data\vault` no projeto. O executável sem `--data-dir` usa `%LOCALAPPDATA%\JarvisGemini\vault`.
4. Abra `wiki/cerebro-jarvis.md` para navegar pelo guia.

Não é necessário plugin do Obsidian para as notas serem lidas pelo Jarvis. A pasta `vault` extraída do ZIP contém os modelos de documentação; o cofre de uso diário fica na pasta de dados.

### Se você já iniciou uma versão anterior

A versão 0.2 copia os guias ausentes ao iniciar; não sobrescreve notas existentes. O botão **Adicionar guias do Jarvis** repete essa importação. Para adicionar esta documentação à instalação existente, copie os cinco arquivos abaixo de `vault\wiki` do ZIP atualizado para a pasta `wiki` do cofre mostrado no painel:

- `cerebro-jarvis.md`
- `jarvis-configuracao.md`
- `jarvis-uso.md`
- `jarvis-skills.md`
- `jarvis-atualizacoes.md`

Se já existir um arquivo com o mesmo nome que você editou, compare os conteúdos antes de substituir. Preserve suas outras notas e o `state.json`. O Jarvis relê as notas na próxima busca ou mensagem; atualize o painel para ver a lista.

### Usar outra pasta de dados

```powershell
py -3 server.py --data-dir "D:\JarvisDados"
```

O cofre será `D:\JarvisDados\vault`. Esse comando muda a raiz de todos os dados; não aponta diretamente para um cofre preexistente e não migra os arquivos antigos. Para mudar de local, encerre o serviço e copie os dados preservando a estrutura.

## 6. Gerar o executável

Execute `GERAR-EXE.bat` no Windows. O resultado esperado é `dist\JarvisGemini\JarvisGemini.exe`. Mantenha a pasta inteira ao distribuir. Node.js, Gemini CLI e login Google continuam necessários. O executável 0.2 foi compilado no Windows. A distribuição padrão inclui texto e leitura SAPI; o microfone é opcional pela versão Python.

## Problemas comuns

| Sintoma | O que conferir |
| --- | --- |
| `py` ou `node` não encontrado | Instalação e novo terminal; siga o requisito do script |
| CLI não encontrado | Rode `CONFIGURAR-GEMINI.bat` e reinicie o serviço |
| Gemini retorna erro | Teste `gemini` no terminal; confira login, internet e cotas |
| Resposta demora mais de três minutos | Reduza o pedido e teste novamente |
| Microfone não transcreve | Permissão do navegador, dependências de voz e download inicial |
| Leitura sem voz em português | Confira as vozes SAPI disponíveis no Windows |
| Nota não aparece no contexto | Use termos do título/conteúdo; a recuperação é parcial |
| `state.json` inválido | Faça uma cópia antes de tentar restaurar de backup |

Para backup, encerre o serviço e copie toda a pasta de dados. Isso preserva notas, conversa e tarefas. O painel atende apenas no computador local; acesso pelo celular ainda é uma atualização futura.

## Referências oficiais

- [Python para Windows](https://www.python.org/downloads/windows/)
- [Node.js](https://nodejs.org/)
- [Instalação do Gemini CLI](https://geminicli.com/docs/get-started/installation/)
- [Autenticação do Gemini CLI](https://geminicli.com/docs/get-started/authentication/)
- [Cotas e preços](https://geminicli.com/docs/resources/quota-and-pricing/)

Requisitos do CLI conferidos em 09/10/2026; consulte as fontes ao atualizar dependências.

