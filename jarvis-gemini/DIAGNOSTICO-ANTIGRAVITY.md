# Diagnóstico do Antigravity — 10 de outubro de 2026

## Mudança autorizada posterior

O proprietário autorizou remover a proteção por ferramentas após receber a explicação do motivo. A exigência de lista vazia e a rejeição de eventos de ferramenta foram removidas. O protocolo, limites, login, START antes do envio, cancelamento e encerramento de processos permanecem. O probe real 1.3.3 passou com 60 ferramentas, sem pedido enviado. A preparação do contexto não lê o cofre local; não há garantia de impedir uma ferramenta nativa de acessar arquivos do usuário. As permissões normais do CLI permanecem, sem bypass de aprovações. Os registros abaixo descrevem a política anterior.

## Registro anterior

A integração continua desativada. A CLI Windows 1.3.3 anunciou 60 ferramentas durante a inicialização, apesar do perfil de conversa com `tools: []`. Os probes encerraram o processo sem transmitir pedido ou dados pessoais. Login Google não resolve, por si só, essa divergência.

## O que foi investigado

Foram testadas as opções documentadas `excludeDefaultComponents: true` e `inheritCustomizations: false`, separadas e combinadas; formatos plano e em pasta para o perfil; diretórios temporários dentro e fora do repositório; corpo do perfil com título de sistema; e configuração local de customizações. Nenhuma variante demonstrou uma lista efetiva de ferramentas vazia.

A listagem `agy agents` não exibiu `jarvis-chat`. Como contraprova, um nome de agente inexistente também apareceu no campo `init.agent`, acompanhado das mesmas 60 ferramentas. Portanto, o nome retornado sozinho não demonstra que o perfil foi carregado. A causa exata da descoberta do perfil permanece inconclusiva: esses resultados não provam que ferramentas foram executadas, nem permitem ignorar a lista anunciada.

As políticas de aprovação e o modo de planejamento não demonstram ausência de ferramentas. Um hook isolado também não atende ao critério aprovado. Não houve alteração de configurações globais, transmissão de credenciais ao modelo, chamada à Gemini API ou contratação de créditos.

## Proteção adicional no Jarvis

O transporte agora rejeita eventos de ferramenta, metadados de ferramenta ou subagente e etapas desconhecidas ou malformadas, inclusive depois de um resultado de sucesso. A resposta é descartada e o processo encerrado. Quando essa contradição ocorre depois do envio, a proteção não pode afirmar que o pedido não foi transmitido ou que uma ação nunca ocorreu. A verificação inicial continua obrigatória antes de cada pedido.

Os testes cobrem contradições antes e depois do resultado, metadados isolados, formatos inválidos e etapas de texto válidas. A suíte Windows completa passou em 68 testes; os eventos e respostas do modelo nesses testes são simulados. Não foi validada uma resposta autenticada real, nem retomada real após reinício.

O processamento no Supabase foi novamente conferido como desativado e não existe tarefa agendada `JarvisWorker`. Pedidos, notas, tarefas e histórico são preservados. Antes de qualquer ativação futura, será necessário comprovar o perfil efetivo e a ausência de ferramentas na CLI real, antes do envio, além dos demais critérios do plano.

## Referências oficiais consultadas

- [Protocolo headless e evento inicial](https://www.antigravity.google/docs/cli/headless/)
- [Perfis de agentes](https://www.antigravity.google/docs/subagents/)
- [Histórico das opções de customização](https://www.antigravity.google/docs/changelog/)
- [Políticas de aprovação](https://www.antigravity.google/docs/permissions/)
- [Hooks](https://www.antigravity.google/docs/hooks/)
