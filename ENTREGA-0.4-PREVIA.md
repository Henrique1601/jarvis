# Entrega local — Jarvis 0.4, prévia Antigravity

9 de outubro de 2026. Branch: `codex/jarvis-antigravity`.

A migração está preparada, mas a conversa de IA permanece bloqueada. O Antigravity CLI 1.3.2 anunciou ferramentas de arquivos, comandos, navegador e MCP mesmo com `tools: []` e também com a lista de conclusão usada num probe. O Jarvis recusou a sessão antes de enviar pedidos ou notas. Login sozinho não resolve essa restrição; nenhuma resposta autenticada foi validada.

## Implementado e verificado

- CLI nativo local, instalador com SHA512 oficial e novo fluxo de login Google; atalho antigo encaminha ao novo. PATH e configurações globais de login preservados.
- Transporte NDJSON com verificação de agente/ferramentas antes do envio, prazo total, limites de saída e proteção da árvore de processos Windows.
- Interface e guias identificam a prévia e o bloqueio de IA; edição, histórico, restauração, tarefas e backup permanecem disponíveis.
- 42 testes passaram; sintaxe Python e JavaScript verificadas. Build Windows com Python 3.12.14 e PyInstaller 6.22.3.
- Executável real: health, assets, busca, edição, histórico, restauração, tarefas e backup passaram. O CLI real foi recusado com HTTP 400 e causa explícita, sem persistir conversa.
- Servidor local reiniciado em 0.4.0. Os 16 arquivos existentes de notas, histórico e estado permaneceram idênticos byte a byte. Backup verificado antes do reinício.
- ZIP fonte: 34 arquivos. ZIP Windows: 84 arquivos. CRC e comparação de todos os arquivos com as fontes/build passaram; dados pessoais, conversa importada, credenciais e CLI nativo não estão nos pacotes.

## Pacotes da prévia

- [Código-fonte](Jarvis-Gemini-0.4-Previa-Codigo.zip)
- [Windows](Jarvis-Gemini-0.4-Previa-Windows.zip)
- [Checksums](SHA256SUMS.txt)

```
e3f08960ab10517d75986414878cb47cf8f08f9d23a348593281972f185bbd1b  Jarvis-Gemini-0.4-Previa-Codigo.zip
d0abf0d2ef35b9c9f56549220d422b23cb45ec895c7666380a5724cf29ae2092  Jarvis-Gemini-0.4-Previa-Windows.zip
```

Os pacotes anteriores 0.2/0.3 foram preservados. O checkpoint pré-migração está em `.recovery/checkpoints/antes-antigravity-20261009-082454.zip`, verificado antes das mudanças. A conversa importada continua em `CONVERSA-JARVIS.md`, fora do Git e dos pacotes.

## Ainda necessário

Demonstrar controle efetivo das ferramentas do Antigravity por sessão antes de liberar conversa. A alternativa é uma API de texto com chave própria, sujeita às cotas e eventual cobrança do provedor; essa mudança depende da escolha do usuário. Não foi configurada nenhuma API nem alterado o modelo de cobrança.

Microfone, leitura SAPI real, resposta autenticada e instalação em outro PC permanecem sem validação. Os perfis Supremo usados no desenvolvimento não foram integrados ao runtime do Jarvis. Não houve publicação externa.
