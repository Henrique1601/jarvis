---
title: 07 Sincronização seletiva
tags: [jarvis, guia]
atualizado: 2026-10-11
---

# 🔄 Sincronização seletiva

A sincronização é opcional e manual. Seu cofre pessoal não é selecionado automaticamente. Somente notas online escolhidas são copiadas para uma pasta dedicada do Jarvis no Windows.

## Primeiro uso

1. Conecte a conta pelo CONFIGURAR-WORKER.bat.
2. Abra CONFIGURAR-SYNC.bat e veja os comandos disponíveis.
3. Liste suas notas online e escolha seus identificadores.
4. Faça uma primeira leitura para criar cópias locais.
5. Abra a pasta dedicada como cofre no Obsidian, se desejar.

Use os comandos reais documentados na ajuda do script; veja também o guia SYNC-NOTAS.md na pasta jarvis-gemini. Escolher uma nota autoriza sua cópia local. Sincronizar envia alterações somente das notas selecionadas.

## Quando há mudanças

- Apenas online mudou: a nova versão pode ser baixada, com cópia preventiva do arquivo local.
- Apenas local mudou: o envio usa a revisão online conhecida.
- Ambos mudaram: conflito; as duas versões são preservadas e não há escolha automática.

Resolva um conflito explicitamente depois de comparar os conteúdos. Desselecionar desativa o vínculo, sem apagar a nota online ou o arquivo local. Copiar arquivos manualmente para esta pasta não autoriza envio automático.

Esta implementação precisa distinguir testes sintéticos de sincronização real da sua conta. Confira [[11 Estado da entrega]] antes de usar em notas importantes.

Relacionados: [[08 Backup e recuperação]], [[04 Notas e memória]].

## Comandos disponíveis

Execute na pasta jarvis-gemini:

```powershell
python sync_notes.py --list
python sync_notes.py --select UUID
python sync_notes.py --pull UUID
python sync_notes.py --sync UUID
python sync_notes.py --remove UUID
python sync_notes.py --resolve cloud --note UUID --revision SHA256
```

--list mostra seleções locais. A opção 1 do menu lista os identificadores online. Envios têm limite de 250 KB em JSON e leituras de 512 KB no componente; texto Unicode pode atingir esse teto antes dos 200 mil caracteres.
