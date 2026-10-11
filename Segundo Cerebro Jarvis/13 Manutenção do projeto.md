---
title: 13 Manutenção do projeto
tags: [jarvis, guia]
atualizado: 2026-10-11
---

# 🔧 Manutenção do projeto

## Antes de alterar

Confira git status, divergências com origin/main e crie um checkpoint que preserve alterações locais. Não use reset ou stash para apagar trabalho. Nunca inclua cofre pessoal, credenciais, backups privados ou transcrições em commits públicos.

## Testar

Na pasta cloud, execute npm test e npm run build. Na pasta jarvis-gemini, execute python -m unittest discover -s tests -v. Testes HTTP locais podem exigir acesso ao localhost fora das restrições do ambiente de execução.

Migrações são aditivas, revisadas e aplicadas no projeto correto. Verificações SQL devem usar usuários sintéticos e rollback. Capture apenas contagens e resultados, sem conteúdo pessoal.

## Publicar

O GitHub main dispara CI e deploy Vercel com raiz cloud. Só registre publicado depois de conferir commit e deployment READY. Assets HTTP públicos e health-check não substituem uma jornada autenticada.

## Atualizar este cérebro

Mantenha os guias alinhados com os nomes reais de botões e comandos. Diferencie implementado, testes sintéticos aprovados, banco verificado e interface real validada. Não cole segredos nos exemplos. Verifique os links internos após renomear notas.

Relacionados: [[08 Backup e recuperação]], [[11 Estado da entrega]], [[10 Arquitetura e decisões]].
