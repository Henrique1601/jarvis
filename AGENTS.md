# Jarvis — orientação dos agentes

O usuário solicitou usar seus agentes Supremo neste projeto em 9 de outubro de 2026.

## Definições locais

Leia o perfil relevante antes de aplicá-lo. As instruções diretas do usuário e as regras do ambiente têm precedência.

- Coordenação principal: `C:/Users/henri/.agents/skills/custom-agents/global-master-agent/SKILL.md`.
- Etapas, prioridades e critérios de aceite: `C:/Users/henri/.agents/skills/custom-agents/skills-orchestrator/SKILL.md`.
- Git, proteção de código e documentação: `C:/Users/henri/.agents/skills/custom-agents/git-master-agent/SKILL.md`.
- Gemini, contexto, memória e ferramentas: `C:/Users/henri/.agents/skills/custom-agents/ai-engineer-agent/SKILL.md`.
- Validação e regressões: `C:/Users/henri/.agents/skills/custom-agents/qa-testing-agent/SKILL.md`.
- Interface e acessibilidade, quando necessário: `C:/Users/henri/.agents/skills/custom-agents/design-engineer-agent/SKILL.md`.
- Segurança, quando necessário: `C:/Users/henri/.agents/skills/custom-agents/security-auditor-agent/SKILL.md`.

Há também definições Markdown em `C:/Users/henri/.agents/custom-agents`. Prefira os caminhos SKILL.md acima para aplicar os perfis nesta máquina. Não presuma que as cópias sejam sempre idênticas ou que contagens antigas de agentes/skills representem o inventário atual.

## Como aplicar ao projeto

O agente principal assume a coordenação do global-master-agent e seleciona apenas os especialistas necessários à demanda. Para uma tarefa que justifique trabalho paralelo, pode delegar subtarefas aos especialistas, passando o caminho do perfil correspondente e um escopo explícito. Não é necessário iniciar um novo chat para isso.

Antes de modificar o código, confira o Git e garanta um checkpoint que inclua as alterações locais. Uma branch apontando para HEAD não preserva arquivos não commitados. Se o repositório ainda não tem commits, use um snapshot dos arquivos-fonte e valide o arquivo de backup; não use stash/reset para um HEAD inexistente. Preserve dados pessoais, notas, histórico e configurações de login.

Classifique a etapa atual pelas evidências de código e testes. Defina o resultado esperado antes de ampliar recursos. Documente alterações relevantes e execute os testes apropriados à mudança. Não declare uma integração autenticada, voz ou distribuição validada apenas por ter código ou testes com mocks.

## Base atual

- Aplicação: `jarvis-gemini/`.
- Plataforma: Windows, painel web local, executável opcional.
- IA: Antigravity CLI com login Google, em migração após o encerramento do acesso individual pelo Gemini CLI. Credenciais são inseridas pelo usuário na interface apropriada.
- Memória: Markdown compatível com Obsidian, com edição, histórico e backup.
- Referências: `jarvis-gemini/README.md`, `jarvis-gemini/VALIDACAO.md`, `jarvis-gemini/vault/wiki/cerebro-jarvis.md`.
- Validação: `python -m unittest discover -s tests -v`, executado em `jarvis-gemini`.

Estes perfis orientam os agentes que desenvolvem o projeto. Este arquivo não instala nem executa esses agentes dentro do aplicativo Jarvis. Integrá-los ao runtime exige uma implementação e validação próprias.
