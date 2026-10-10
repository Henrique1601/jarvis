---
tags: [jarvis, versao, antigravity, validacao]
atualizado: 2026-10-09
status: previa-conversa-bloqueada
---

# Jarvis 0.4.0 — prévia Antigravity, conversa bloqueada

Voltar: [[cerebro-jarvis]]. Configurar: [[jarvis-configuracao]]. Versão anterior: [[jarvis-versao-0.3]].

## Motivo da migração

O acesso de contas individuais, Google AI Pro e Ultra pelo login Google do Gemini CLI foi encerrado em 18 de junho de 2026. O Google recomenda migrar para a família Antigravity. Fonte: [aviso oficial](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals).

## Instalação e login

Use `CONFIGURAR-ANTIGRAVITY.bat`. O script anterior `CONFIGURAR-GEMINI.bat` encaminha para esse fluxo. O CLI nativo Antigravity 1.3.2 fica em `.tools/antigravity/agy.exe`, com SHA-512 verificado, sem instalar SDK nem alterar PATH, aliases ou configurações globais. Node.js não é requisito para usar o CLI nativo.

Faça o novo login no navegador aberto pelo CLI. Digite senha e outros dados de acesso apenas na interface Google; não coloque credenciais na conversa nem nas notas. Encontrar o executável não confirma autenticação, plano, cota ou resposta real.

## Objetivo: conversa somente texto — atualmente bloqueada

O workspace usa perfil `jarvis-chat` com `tools: []` e comandos desativados. Antes de transmitir pedido/notas, o runtime exige `init.agent` esperado e `init.tools` vazio. O CLI real 1.3.2 confirmou o agente, mas anunciou cerca de 59 ferramentas, incluindo comandos, arquivos, web, navegador, MCP e mensagens. A tentativa com allowlist também manteve as ferramentas anunciadas. O gate bloqueou sem enviar o prompt. **A migração não foi concluída; login sozinho não resolve esse bloqueio.** A prévia preserva código e guias para revisão, sem habilitar conversa.

O perfil restrito do runtime não é o catálogo de agentes Supremo usado para desenvolver o Jarvis. Não foram integradas ações de notas, tarefas, CRM ou Notion pela conversa.

## Memória e dados preservados

Continuam disponíveis edição, conflito, histórico/restauração, backup, importação sem sobrescrita, tarefas e recuperação de trechos com origem. O prompt continua limitado a 32.000 caracteres, incluindo instruções, JSON e pedido; pedidos aceitos de até 12.000 caracteres permanecem intactos. Veja [[jarvis-versao-0.3]] para os limites por componente.

`INICIAR.bat` usa `data` do projeto. O executável preserva o caminho padrão `%LOCALAPPDATA%/JarvisGemini`. A atualização não exige apagar ou recriar o cofre. Faça backup antes de trocar a versão; não extraia restauração sobre dados ativos.

## Situação da verificação

Os 42 testes passaram em 10,323 s com Python 3.14.5 no Windows; JavaScript e sintaxe Python passaram. O instalador PowerShell passou com CLI existente e em instalação nova com download/SHA-512. O build com PyInstaller 6.22.3/Python 3.12.14 concluiu; health, assets, busca, edição, histórico, restauração, tarefas e backup do executável 0.4.0 passaram via HTTP.

No CLI real, o gate bloqueou o conjunto de ferramentas antes de enviar o pedido. Não foi demonstrada uma restrição efetiva no 1.3.2; autenticação e resposta real continuam pendentes. Esses checks locais e mocks não demonstram segurança do CLI autenticado. Whisper e SAPI reais continuam pendentes. O registro técnico é `VALIDACAO.md` no código-fonte.

Os pacotes desta etapa são `Jarvis-Gemini-0.4-Previa-Codigo.zip` e `Jarvis-Gemini-0.4-Previa-Windows.zip`, com hashes em `SHA256SUMS.txt`. A geração final dos pacotes é registrada separadamente dos testes.

## Próximo passo

Demonstrar isolamento e controle efetivo de ferramentas no CLI real antes de habilitar conversa. A alternativa é um provedor de API de texto com chave e acesso/cobrança próprios, separado da assinatura Google AI Pro; isso exige escolha do usuário. Depois observar resposta real com evidência de nota. A ampliação para ferramentas e pesquisa depende de implementação e validação próprias. Não há publicação externa nesta entrega.
