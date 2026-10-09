# Verificação do Jarvis

Data: 9 de outubro de 2026. Plataforma: Windows 11.

## Versão 0.3.0 — validação local

| Verificação | Resultado |
| --- | --- |
| Testes automatizados do serviço | 32 passaram em 4,744 s com Python 3.14.5 no Windows, sem `ResourceWarning` |
| Evidências no meio/fim de notas longas | Regressões aprovadas, incluindo evidência após 20.000 caracteres e captura do prompt enviado ao CLI pela API |
| Orçamento total de contexto e histórico | Regressões aprovadas; teto de 32.000 caracteres inclui instruções, JSON serializado e pedido |
| CLI: formato, timeout, erro e resposta vazia | Regressões aprovadas, incluindo falha de inicialização por `OSError` |
| Concorrência e liberação dos locks | Regressões aprovadas; pedidos seguintes funcionam após falhas |
| JavaScript | `node --check` em app.js e workspace.js aprovado nesta entrega |
| Sintaxe Python | `py_compile` aprovado nesta entrega |
| Build Windows desta entrega | PyInstaller 6.22.3 com Python 3.12.14 concluído |
| Executável real 0.3.0 | Health, assets, busca, edição, histórico, restauração, tarefas e backup aprovados por HTTP com dados descartáveis |
| Conversa autenticada Gemini e voz real | Pendentes de validação pelo usuário |

O teste do executável não usou Gemini nem login. Não houve nova jornada no Chrome nesta rodada, nem validação de instalação em outro PC. Os resultados da versão 0.2 abaixo são registros anteriores.

### Limites do contexto 0.3.0

- Prompt completo de até 32.000 caracteres, medido após serializar o JSON; o pedido aceito de até 12.000 caracteres permanece intacto.
- Até seis notas, com até três trechos de 1.000 caracteres por nota, arquivo, posições e linhas de origem.
- Até cinquenta tarefas, com até 300 caracteres do texto de cada uma.
- Até dez mensagens recentes, com até os 2.000 caracteres finais de cada mensagem.
- Prioridade: notas, tarefas e histórico; os componentes cedem espaço para respeitar o limite total. A seleção não modifica os dados persistidos.

## Registro da versão 0.2

| Verificação | Resultado |
| --- | --- |
| Testes automatizados do serviço | 13 passaram com Python 3.14 |
| JavaScript | `node --check` em app.js e workspace.js |
| CLI instalado | Gemini CLI 0.63.0, Node.js 24.16.0 |
| Compatibilidade | `--output-format` e `--admin-policy` confirmados pelo CLI real |
| Chrome | Criar e editar nota, consultar histórico, restaurar versão e criar backup |
| Build Windows | PyInstaller 6.22.3 com Python 3.12.14 |
| Executável | Inicialização, assets, notas, histórico, restauração e backup validados por HTTP |

## Limites da verificação

Conversa autenticada com Gemini depende do login Google pelo usuário. Respostas do modelo nos testes são simuladas; o aplicativo usa o CLI real. Microfone/Whisper e reprodução SAPI ainda precisam de teste pelo usuário. O executável padrão inclui texto e leitura SAPI; não incorpora o modelo de transcrição.

## Mudanças da primeira versão recuperada

Restaurados dois trechos de código ocultados automaticamente no histórico. Corrigidos escapes de novas linhas ao recuperar o código. Atualizada a resolução do pacote Gemini no Windows para usar sua entrada declarada em `package.json`, incluindo instalação local. Implementados diagnóstico, edição com detecção de conflito, histórico/restauração, backup, importação não destrutiva dos guias e indicação de contexto.

Arquivos de dados e login Google não são incluídos nos ZIPs de distribuição.
