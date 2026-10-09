# Jarvis 0.2 — memória e diagnóstico

Atualização de 9 de outubro de 2026. Voltar: [[cerebro-jarvis]].

## Implementado

- Diagnóstico com versões Python, Node.js e Gemini CLI.
- Gemini CLI 0.63.0 instalado localmente; login Google pelo script de configuração.
- Edição completa do Markdown, histórico e restauração de versões.
- Detecção de conflito com edição externa no Obsidian.
- Backup ZIP do cofre inteiro, conversa, tarefas e histórico.
- Importação dos guias ausentes sem substituir notas existentes.
- Busca por palavras completas com maior peso para títulos.
- Exibição das notas enviadas como contexto nas novas respostas.
- Executável Windows com texto e leitura SAPI; microfone pela versão fonte.

## Caminhos

`INICIAR.bat` usa `data` na pasta do projeto. Abra `data/vault` no Obsidian. O executável sem argumentos usa `%LOCALAPPDATA%/JarvisGemini`. Use `--data-dir` para compartilhar ou restaurar outro conjunto de dados.

## Backup e restauração

Use **Criar backup dos dados** e copie o ZIP para outro disco. Para restaurar todo o conjunto, encerre o serviço, preserve os dados atuais, extraia em uma pasta separada e inicie com `--data-dir` apontando para ela. O ZIP não inclui login Google nem dependências.

O histórico guarda alterações feitas pelo painel. Ao detectar conflito com Obsidian, copie seu rascunho e reabra a nota antes de salvar. **Restaurar versão** também preserva o conteúdo que será substituído.

## Próximo passo

Entrar com Google e testar uma resposta real usando uma nota. Depois instalar voz na versão fonte e validar microfone/transcrição. Skills, integrações CRM/Notion e busca semântica continuam planejadas.
