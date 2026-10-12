---
title: 09 Solução de problemas
tags: [jarvis, guia]
atualizado: 2026-10-11
---

# 🛠️ Solução de problemas

## Entrei, mas o banco recusou acesso

Confira se o e-mail foi confirmado e autorizado no servidor e no banco. Uma sessão antiga pode exigir sair e entrar novamente. Não altere políticas para liberar todos os usuários. Se persistir, registre o erro sem tokens ou senhas.

## Windows offline

Confirme que o PC está ligado, que o componente não está pausado e que a conta foi conectada. Abra CONFIGURAR-WORKER.bat, confira o estado e retome uma única instância. Aguarde a atualização de presença. O pedido continua na fila até o prazo indicado.

## Microfone local retorna erro e chat perde conexão

Na versão local, o erro de transcrição reproduzido em 11/10/2026 era incompatibilidade do faster-whisper 1.2.1 com PyAV 19. A correção usa PyAV abaixo de 19. Execute INSTALAR-VOZ.bat atualizado, reinicie pelo INICIAR.bat desta pasta e recarregue o painel. Não use somente `py server.py` se a voz foi instalada no `.venv`.

“Conexão recusada” significa que não há servidor respondendo naquele endereço. Mantenha a janela do INICIAR.bat aberta. Se ela informar que o servidor encerrou, confira a mensagem e o código de saída antes de abrir novamente. Depois de reiniciar, recarregue o navegador para obter a nova sessão local. A transcrição por silêncio sintético passou; confirme também uma gravação real pelo microfone.

## Recuperação de senha falhou

Use a recuperação no site e conclua a nova senha pelo link recebido. Confira a URL de retorno configurada no Supabase se o link voltar a uma página errada. Não envie o link de recuperação ou códigos ao agente.

## Copiar não funcionou

O navegador pode negar acesso à área de transferência. Selecione o texto e copie manualmente. Uma falha de cópia não deve apagar a resposta.

## Nota mudou antes de salvar

Há edição concorrente. Preserve seu texto, abra a versão atual e compare. Na sincronização, use a resolução explícita do conflito, sem sobrescrever a versão remota por insistência.

## Resultado incerto ou timeout

Uma execução pode ter começado antes da queda de conexão. O Jarvis não gera de novo automaticamente. Confira o Windows e decida se quer enviar um novo pedido.

## Formatação ou instalação do celular

Confira a versão publicada e atualize a página. A instalação depende do navegador; o cache não disponibiliza suas notas privadas offline. Não limpe armazenamento sem preservar rascunhos.

Relacionados: [[05 Windows e Antigravity]], [[11 Estado da entrega]].
