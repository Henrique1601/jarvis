---
title: 10 Arquitetura e decisões
tags: [jarvis, guia]
atualizado: 2026-10-11
---

# 🏗️ Arquitetura e decisões

## Caminho de uma conversa

Navegador → API Vercel → fila Supabase → conexão HTTPS de saída do Windows → Antigravity → conclusão transacional Supabase → painel.

Login e dados são isolados por proprietário. O dispositivo usa sessão da conta e credencial revogável protegidas pelo Windows. Nenhuma chave administrativa Supabase fica no computador. Tokens Google continuam no armazenamento do CLI.

## Regras preservadas

- Cinco pedidos pendentes por conta, vinte novos por hora.
- Uma execução por vez; fila em ordem.
- Pedidos aguardando expiram em sete dias.
- Execução de até 180 segundos; reserva de 240, renovada a cada trinta.
- Cancelar invalida a execução e impede publicação tardia.
- Resultado incerto não é regenerado automaticamente.
- Resposta concluída e mensagens são persistidas numa transação.
- Conversas, metadados e sync preservam dados existentes por migração aditiva.

## Decisões da entrega

Conversas separam histórico e contexto. Etiquetas não executam comandos. Sincronização é optativa e manual. O site instalável armazena apenas recursos públicos e rascunhos temporários, sem cache de APIs privadas. Não há promessa de uso ilimitado do Antigravity.

Relacionados: [[13 Manutenção do projeto]], [[11 Estado da entrega]].
