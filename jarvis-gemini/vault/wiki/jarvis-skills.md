---
tags: [jarvis, skills, obsidian, arquitetura]
atualizado: 2026-10-09
status: proposta
---

# Jarvis — skills no cérebro do Obsidian

Voltar: [[cerebro-jarvis]]. Plano: [[jarvis-atualizacoes]].

## Papel de uma skill

Uma skill descreve um procedimento reutilizável: quando usar, informações necessárias, etapas, ferramentas permitidas e resultado esperado. O Obsidian pode guardar sua documentação e histórico. A execução exige que o serviço reconheça a skill e ofereça as ferramentas correspondentes.

Nesta versão, estas páginas são documentação. O serviço não tem registro de skills, não carrega `SKILL.md` e trata notas como dados. Não basta criar uma pasta chamada `skills` para ativar funções. O CLI tem seus próprios recursos, mas o Jarvis não os integra como um catálogo de skills nesta entrega.

## Catálogo proposto

| Skill planejada | Resultado | Uso possível hoje | Implementação necessária |
| --- | --- | --- | --- |
| Estudos de IA | Plano, explicação e exercício | Pedir na conversa e salvar pelo painel | Modelo de rotina, progresso e registro estruturado |
| Organização de projetos | Resumo, pendências e próximo passo | Consultar notas e lista de tarefas | Atualização de tarefas por ferramenta |
| Gestão do cofre | Capturar e organizar conhecimento | Salvar manualmente e editar no Obsidian | Escrita controlada, edição e histórico de alterações |
| Resumo de tecnologia | Notícias com fontes e impacto | Pedir pesquisa na conversa | Agendador, persistência e notificações |
| Prospecção comercial | Leads registrados e acompanhados | Elaborar plano e textos na conversa | Integrações reais com CRM e Notion, deduplicação e registro de falhas |

## Especificação para o futuro carregador

Cada skill deverá informar nome e versão, objetivo, gatilho, entradas, procedimento, ferramentas permitidas, saída e critério de sucesso. O resultado deve distinguir recomendações de ações efetivamente realizadas e indicar erros de integração.

Exemplo de procedimento documentado para estudos:

1. Receber matéria, tempo disponível e dificuldade.
2. Consultar as notas relevantes e o progresso registrado.
3. Propor uma sessão com explicação curta, exercício e revisão.
4. Avaliar a resposta do estudante.
5. Registrar o resultado quando a ferramenta de gravação estiver implementada; hoje, oferecer o conteúdo para salvar pelo botão.

## Condições para ativar skills

- Registro explícito das skills disponíveis.
- Separação entre conhecimento do cofre e instruções selecionadas pelo serviço.
- Ferramentas com entradas validadas e escopo definido.
- Registro do que foi feito e tratamento de falhas.
- Teste de cada fluxo completo antes de anunciá-lo no painel.

Esta especificação não é uma skill instalada. A implementação pertence à etapa de automação do roadmap.

