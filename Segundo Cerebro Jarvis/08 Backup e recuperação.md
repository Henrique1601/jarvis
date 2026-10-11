---
title: 08 Backup e recuperação
tags: [jarvis, guia]
atualizado: 2026-10-11
---

# 💾 Backup e recuperação

## Dados online

Use Criar backup dos dados para exportar JSON da conta. Guarde em uma pasta sua, fora do repositório público. O backup inclui registros de notas, versões, tarefas, conversas e pedidos conforme a versão do schema. A exportação não implica que exista um botão de importação completa: não tente restaurar sobrescrevendo o banco manualmente.

Para recuperar uma nota, prefira o histórico e a restauração pela interface. Antes de uma edição importante, copie também o texto original.

## Dados Windows

O cofre local possui seu próprio backup. A sincronização seletiva mantém cópias preventivas na pasta dedicada antes de substituir arquivos. Sessão protegida pelo Windows não é portável para outro usuário ou outro PC; configure o login novamente nesse caso.

## Código do projeto

Branches de checkpoint preservam código commitado. Alterações não commitadas precisam de snapshot ou commit próprio. Backups de código não incluem automaticamente seus dados pessoais, e não devem publicá-los.

Relacionados: [[07 Sincronização seletiva]], [[13 Manutenção do projeto]].
