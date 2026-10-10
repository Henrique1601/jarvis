'use strict';
let selectedNote = null;
let editingNote = null;

async function openRead(noteId, title) {
  try {
    selectedNote = await api('note-read', { id: noteId });
    $('read-title').textContent = title || noteId.split('/').pop();
    $('read-path').textContent = noteId;
    $('read-content').textContent = selectedNote.content;
    $('read-notice').textContent = '';
    $('history-details').open = false;
    $('note-history').replaceChildren();
    if (!$('read-dialog').open) $('read-dialog').showModal();
  } catch (error) { notice(error.message); }
}

function resetEditor() {
  editingNote = null;
  $('editor-heading').textContent = 'Guardar na memória';
  $('title-field').hidden = false;
  $('folder-field').hidden = false;
  $('note-title').required = true;
  $('note-content').maxLength = 20000;
  $('editor-notice').textContent = '';
}
$('note-dialog').addEventListener('close', resetEditor);
$('edit-note').onclick = () => {
  editingNote = { ...selectedNote };
  $('title-field').hidden = true;
  $('folder-field').hidden = true;
  $('note-title').required = false;
  $('note-content').maxLength = 200000;
  $('editor-heading').textContent = 'Editar memória';
  $('note-content').value = selectedNote.content;
  $('editor-notice').textContent = 'O conteúdo atual será guardado no histórico ao salvar.';
  $('read-dialog').close();
  $('note-dialog').showModal();
};
$('note-form').onsubmit = async event => {
  event.preventDefault();
  $('save-note').disabled = true;
  try {
    if (editingNote) {
      await api('note-update', { id: editingNote.id, revision: editingNote.revision, content: $('note-content').value });
    } else {
      await api('note', { title: $('note-title').value, content: $('note-content').value, folder: $('note-folder').value });
    }
    $('note-dialog').close();
    await refresh(false);
    notice('Memória salva.');
  } catch (error) { $('editor-notice').textContent = error.message; }
  finally { $('save-note').disabled = false; }
};
$('history-details').ontoggle = async () => {
  if (!$('history-details').open || !selectedNote) return;
  try {
    const result = await api('note-history', { id: selectedNote.id });
    $('note-history').replaceChildren();
    if (!result.versions.length) $('note-history').append(el('p', 'Ainda não há versões anteriores.', 'muted'));
    for (const version of result.versions) {
      const row = el('div', undefined, 'history-row');
      row.append(el('span', new Date(version.time).toLocaleString('pt-BR')));
      const restore = el('button', 'Restaurar versão', 'subtle');
      restore.onclick = async () => {
        restore.disabled = true;
        try {
          const noteId = selectedNote.id;
          await api('note-restore', { id: noteId, version: version.id, revision: selectedNote.revision });
          await openRead(noteId, $('read-title').textContent);
          $('read-notice').textContent = 'Versão restaurada. A versão substituída também ficou no histórico.';
          await refresh(false);
        } catch (error) { $('read-notice').textContent = error.message; }
        finally { restore.disabled = false; }
      };
      row.append(restore);
      $('note-history').append(row);
    }
  } catch (error) { $('read-notice').textContent = error.message; }
};

const tools = el('section', undefined, 'workspace-tools');
tools.append(el('p', 'CUIDE DO SEU COFRE', 'eyebrow'));
const diagnosticButton = el('button', 'Verificar instalação', 'outline');
diagnosticButton.id = 'diagnostics';
const backupButton = el('button', 'Criar backup dos dados', 'outline');
backupButton.id = 'backup';
const docsButton = el('button', 'Adicionar guias do Jarvis', 'subtle');
docsButton.id = 'import-docs';
const feedback = el('p', '', 'feedback');
feedback.id = 'workspace-notice';
feedback.setAttribute('role', 'status');
tools.append(diagnosticButton, backupButton, docsButton, feedback);
document.querySelector('.right').append(tools);

diagnosticButton.onclick = async () => {
  $('diagnostic-content').textContent = 'Verificando…';
  $('diagnostic-notice').textContent = '';
  $('test-ai').disabled = true;
  $('diagnostic-dialog').showModal();
  try {
    const result = await api('diagnostics', {});
    $('diagnostic-content').replaceChildren();
    for (const [label, value] of [
      ['Jarvis', result.version], result.cloud ? ['Servidor', 'Node.js'] : ['Python', result.python],
      [result.provider || 'Antigravity CLI', result.cli || 'Não encontrado'], ['Integração', result.compatible ? 'Opções compatíveis' : 'Precisa de configuração'],
      ['Transcrição local', result.voiceInstalled ? 'Instalada' : 'Opcional • não instalada'], ['Conta Google', result.login]
    ]) {
      const row = el('div', undefined, 'diagnostic-row');
      row.append(el('span', label), el('strong', value));
      $('diagnostic-content').append(row);
    }
    for (const issue of result.issues) $('diagnostic-content').append(el('p', issue, 'feedback'));
    $('test-ai').disabled = !result.compatible;
  } catch (error) { $('diagnostic-notice').textContent = error.message; }
};
$('close-diagnostic').onclick = () => $('diagnostic-dialog').close();
$('test-ai').onclick = async () => {
  $('test-ai').disabled = true;
  $('diagnostic-notice').textContent = state?.cloud ? 'Testando a Gemini API…' : 'Testando com a conta conectada ao Antigravity CLI…';
  try {
    const result = await api('ai-check', {});
    $('diagnostic-notice').textContent = result.login;
  } catch (error) { $('diagnostic-notice').textContent = error.message; }
  finally { $('test-ai').disabled = false; }
};
backupButton.onclick = async () => {
  backupButton.disabled = true;
  feedback.textContent = 'Criando backup…';
  try {
    if (window.jarvisPlatform?.backup) {
      await window.jarvisPlatform.backup();
      feedback.textContent = 'Backup exportado. Guarde o arquivo em um lugar seguro.';
    } else {
      const result = await api('backup', {});
      feedback.textContent = 'Backup criado em: ' + result.path;
    }
  } catch (error) { feedback.textContent = error.message; }
  finally { backupButton.disabled = false; }
};
docsButton.onclick = async () => {
  docsButton.disabled = true;
  try {
    const result = await api('docs-import', {});
    await refresh(false);
    feedback.textContent = result.copied.length ? result.copied.length + ' guias adicionados.' : 'Os guias já estão no seu cofre.';
  } catch (error) { feedback.textContent = error.message; }
  finally { docsButton.disabled = false; }
};
