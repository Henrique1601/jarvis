---
tags: [jarvis, guia, memoria, voz]
atualizado: 2026-10-09
---

# Jarvis — como usar

Voltar: [[cerebro-jarvis]]. Instalação: [[jarvis-configuracao]].

## Memória na versão 0.2

Ao abrir uma nota, use **Editar nota**. O Markdown inteiro fica disponível; uma cópia anterior é salva ao alterar. Em **Versões anteriores**, restaure uma versão sem perder a substituída. Se a nota mudar no Obsidian, o painel detecta o conflito; copie seu rascunho antes de fechar e reabrir a nota.

**Criar backup dos dados** guarda cofre, histórico, conversa e tarefas em ZIP. Copie o arquivo para outro disco. As novas respostas mostram as notas enviadas como contexto.

## Conversar

Escreva um pedido na caixa de mensagem e clique em **Enviar**. `Enter` envia; `Shift+Enter` cria uma nova linha. Os atalhos do painel ajudam a planejar estudos, definir prioridades e pesquisar novidades.

Exemplos:

- “Monte um plano de estudos de aprendizagem supervisionada para hoje, considerando minhas tarefas.”
- “Encontre nas notas o projeto CRM e resuma o próximo passo.”
- “Explique JWT com um exemplo de React e Node.js.”
- “Pesquise três novidades de IA e programação, com fontes e impacto.”
- “Com base em Jarvis configuração, explique como abrir meu cofre no Obsidian.”

Mencione o nome do projeto ou o tema da nota para ajudar a busca. A conversa usa o Gemini na nuvem e exige internet. Se faltarem notas no contexto, abra a nota desejada e forneça o trecho relevante.

## Guardar conhecimento

Clique em **Guardar uma ideia**, preencha título e conteúdo, selecione a pasta e salve. Você também pode usar o botão de guardar uma resposta na conversa.

| Pasta | Conteúdo sugerido |
| --- | --- |
| `raw` | Ideias rápidas, capturas e dúvidas |
| `wiki` | Perfil, conceitos revisados e documentação de projetos |
| `outputs` | Planos, resumos e respostas que vale conservar |

Exemplo de nota:

```markdown
# Projeto CRM — próximos passos

Objetivo: organizar a prospecção de empresas.
Situação: registrar aqui o estado confirmado do projeto.
Próximo passo: descrever uma ação concreta.
Dúvidas: listar informações que precisam de validação.
Atualizado: informar a data da revisão.
```

No Obsidian, você pode editar os arquivos diretamente e criar links como `[[cerebro-jarvis]]`. O painel mostra o texto Markdown; o Obsidian oferece a navegação por links. Pedir “guarde essa ideia” na conversa não grava a nota automaticamente nesta versão: use o botão de salvar.

## Buscar e recuperar

Digite palavras no campo **Buscar nas notas** e abra o resultado. A busca atual compara palavras do pedido com título e conteúdo. A lista mostra até cem notas, e a conversa recebe até seis notas relevantes. Arquivos acima de 200 KB e links simbólicos são ignorados. Para documentos longos, divida o conhecimento em notas por assunto.

O serviço mantém até duzentas mensagens, mas inclui apenas as dez mais recentes no contexto. Para lembrar um fato de forma duradoura, salve-o em uma nota.

## Organizar tarefas

Digite uma tarefa em **Seu próximo passo** e use o botão de adicionar. Marque ou desmarque a conclusão. Peça ao Jarvis para sugerir prioridades considerando a lista.

A tarefa é salva pelo formulário. Pedidos na conversa produzem sugestões, mas ainda não criam tarefas automaticamente. A lista atual não tem prazo, recorrência ou notificação.

## Falar e ouvir

Use **Falar** para gravar, confira a transcrição e envie. A interface limita a gravação a aproximadamente 55 segundos. Use **Ouvir** para ler uma resposta; a leitura aceita até 6.000 caracteres. Não há escuta contínua.

## Uma rotina prática

1. Registre suas tarefas do dia no painel.
2. Peça um plano de estudos de IA de 20 minutos.
3. Faça perguntas e resolva o exercício sugerido.
4. Salve a explicação útil em `wiki` e o plano em `outputs`.
5. Marque a tarefa concluída e registre o próximo passo.

## O que ainda precisa de implementação

Notion, CRM, agenda externa, MCP personalizado, skills executáveis, controle de aplicativos, sincronização entre PCs e automações estão no [[jarvis-atualizacoes|roadmap]]. O assistente não deve dizer que realizou essas ações nesta primeira versão.

