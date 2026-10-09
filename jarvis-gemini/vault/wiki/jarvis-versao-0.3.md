---
tags: [jarvis, versao, memoria, validacao]
atualizado: 2026-10-09
status: validado-localmente
---

# Jarvis 0.3.0 — contexto e confiabilidade

Voltar: [[cerebro-jarvis]]. Próximas etapas: [[jarvis-atualizacoes]]. Versão anterior: [[jarvis-versao-0.2]].

## Implementado no código-fonte

- Recuperar trechos relacionados ao pedido em notas longas, incluindo evidências depois dos primeiros 20.000 caracteres, com identificação da origem.
- Aplicar um orçamento total ao contexto, preservando o pedido atual e limitando o histórico antigo.
- Validar o formato da resposta do Gemini CLI e tratar timeout, erro e resposta vazia.
- Verificar que pedidos simultâneos e falhas não deixem o serviço bloqueado.

### Como o contexto é limitado

O prompt completo tem teto de 32.000 caracteres, incluindo instruções, JSON serializado e pedido. O pedido aceito de até 12.000 caracteres permanece intacto. O contexto prioriza notas, depois tarefas e histórico:

- Até seis notas, com até três trechos de 1.000 caracteres por nota. Cada trecho informa arquivo, posições e linhas.
- Até cinquenta tarefas, com texto de até 300 caracteres por tarefa.
- Até dez mensagens recentes, com até os 2.000 caracteres finais de cada mensagem.

O serviço reduz ou deixa de incluir componentes para respeitar o limite total. Isso não reduz notas, tarefas ou mensagens salvas. A lista de fontes contém as notas efetivamente enviadas; não comprova que o modelo usou todas.

## Verificação local

Os 32 testes passaram com Python 3.14.5 no Windows, incluindo regressões de recuperação, orçamento de contexto, falhas do CLI, concorrência e captura do prompt enviado pela API. JavaScript e sintaxe Python também foram verificados. O executável 0.3.0 foi compilado com PyInstaller 6.22.3 e Python 3.12.14; health, assets, busca, edição, histórico, restauração, tarefas e backup foram exercitados por HTTP com dados descartáveis, sem Gemini/login. Não houve nova jornada Chrome nesta rodada. O registro técnico fica no arquivo `VALIDACAO.md` do código-fonte. A validação local não confirma instalação em outro PC nem publicação externa.

## O que permanece disponível

Diagnóstico, edição de notas, detecção de conflitos com Obsidian, histórico/restauração, importação sem sobrescrita, backup e tarefas continuam fazendo parte do aplicativo. As notas enviadas são contexto; sua presença na lista não garante que o modelo tenha usado cada uma na resposta.

## Validação real pendente

O usuário precisa entrar com Google, conferir uma resposta real usando evidência de uma nota e observar transcrição e leitura em português. Testes com resposta simulada do CLI verificam o serviço, mas não confirmam autenticação, cota, qualidade do modelo ou áudio no PC.

## Próxima etapa

Depois de consolidar esta base, especificar perfis e ferramentas no runtime: catálogo explícito, instruções confiáveis separadas das notas, permissões por ação, persistência e registro de sucesso ou falha. Os agentes Supremo orientam o desenvolvimento; esta entrega não os executa dentro do Jarvis.
