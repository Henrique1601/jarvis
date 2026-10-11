# Notas escolhidas entre o Windows e o site

Abra `CONFIGURAR-SYNC.bat` depois de conectar a conta em `CONFIGURAR-WORKER.bat`. Liste as notas, copie o UUID desejado e escolha **Selecionar e baixar**. Somente essa nota será copiada. A sincronização é voluntária e não inicia com o Windows.

Os arquivos Markdown ficam em `%LOCALAPPDATA%/JarvisGemini/sync/UUID.md`. Essa pasta é separada do cofre local. Edite o Markdown em um editor ou abra a pasta como cofre do Obsidian. As notas são texto simples no disco, protegido pelas permissões da conta Windows; a sessão de login continua protegida por DPAPI. Não há importação nem varredura automática de outros arquivos.

**Sincronizar uma nota** envia alterações locais quando somente o arquivo mudou; baixa alterações online quando somente a nota no site mudou. **Só baixar alterações online** jamais envia mudanças locais. Arquivos locais são copiados para `backups/` antes da substituição ou do envio. Remover uma seleção preserva o arquivo, os backups e a nota online.

Se ambos mudaram, o resultado será `conflict`: o arquivo principal conserva a versão local e `UUID.cloud.md` guarda a versão online. Consulte a revisão do conflito na opção Listar. Leia as duas versões antes de escolher **Resolver conflito**, indicar `cloud` (online) ou `local` e confirmar a revisão SHA256 exibida. Se o site mudou novamente, a resolução é recusada. Não existe resolução automática nem envio repetido em caso de falha de conexão.

Comandos equivalentes, executados nesta pasta:

```powershell
python sync_notes.py --list
python sync_notes.py --select UUID
python sync_notes.py --pull UUID
python sync_notes.py --sync UUID
python sync_notes.py --remove UUID
python sync_notes.py --resolve cloud --note UUID --revision SHA256
```

Cada operação exige sessão válida da conta autorizada; sessão vencida exige renovação pelo worker ou reconexão. A ferramenta não renova em paralelo para evitar disputa da sessão compartilhada. Notas aceitam até 200 mil caracteres. O servidor confere proprietário, cota de armazenamento e revisão antes de cada envio. Não há exclusão automática, criação online por arquivo local, comandos extraídos de notas, acesso pelo Antigravity ou leitura do cofre pessoal nesta implementação.

A revisão online é um identificador opaco de 64 dígitos hexadecimais: pode mudar quando etiquetas ou pasta mudam, mesmo que o texto permaneça igual. O hash local é calculado separadamente sobre o Markdown. O transporte reutilizado do worker limita respostas a 512 KB e o servidor limita envios a 250 KB de JSON; caracteres acentuados são escapados no envio e podem atingir esse teto antes de 200 mil caracteres. Divida notas grandes se atingir esses limites. O programa preserva os arquivos quando recusa uma operação por tamanho.

O manifesto registra UUID, revisão, hash base e eventual conflito. Um arquivo `.sync.lock` impede dois consoles simultâneos. Se o console encerrou abruptamente e nenhuma sincronização está aberta, remova **somente esse arquivo** da pasta dedicada e tente novamente. Preserve o manifesto e os Markdown. Em uma falha após salvar no servidor mas antes de confirmar localmente, a próxima sincronização compara o conteúdo e reconhece o resultado sem duplicar a alteração.

Validação: testes com notas sintéticas cobrem mudanças locais e online, conflito manual, backup, repetição, erro de autenticação, edição concorrente e caminhos inválidos. A sincronização autenticada de notas reais permanece pendente; nenhuma nota pessoal foi enviada durante os testes.
