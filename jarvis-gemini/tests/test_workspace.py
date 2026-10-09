import io
import json
import tempfile
import threading
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import server


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.test_root = Path(__file__).resolve().parent
        self.temp = tempfile.TemporaryDirectory(dir=self.test_root)
        self.store = server.Store(self.temp.name)

    def tearDown(self):
        self.assertTrue(Path(self.temp.name).resolve().is_relative_to(self.test_root))
        self.temp.cleanup()

    def test_edit_history_restore_and_external_conflict(self):
        note_id = self.store.note('Projeto', 'Conteúdo inicial')
        initial = self.store.read_note(note_id)
        saved = self.store.update_note(note_id, '# Projeto\n\nEditado pelo painel\n', initial['revision'])
        versions = self.store.note_history(note_id)
        self.assertEqual(len(versions), 1)
        restored = self.store.restore_note(note_id, versions[0]['id'], saved['revision'])
        self.assertEqual(restored['content'], initial['content'])
        self.assertEqual(len(self.store.note_history(note_id)), 2)
        path = self.store.note_path(note_id)
        path.write_text('# Projeto\nAlterado no Obsidian', encoding='utf-8')
        with self.assertRaises(server.ConflictError):
            self.store.update_note(note_id, 'Tentativa antiga', restored['revision'])
        self.assertIn('Alterado no Obsidian', path.read_text(encoding='utf-8'))
        self.assertEqual(len(self.store.note_history(note_id)), 2)

    def test_block_outside_vault_and_wrong_versions(self):
        note_id = self.store.note('Nota', 'Conteúdo')
        for invalid in ('../state.json', '/tmp/note.md', 'wiki/../../x.md', 'C:/x.md', 'raw\\x.md', 'state.json'):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                self.store.read_note(invalid)
        with self.assertRaises(ValueError):
            self.store.restore_note(note_id, '../../state', self.store.read_note(note_id)['revision'])

    def test_backup_contains_notes_history_and_state_without_credentials(self):
        note_id = self.store.note('Memória', 'Antes')
        note = self.store.read_note(note_id)
        self.store.update_note(note_id, 'Depois', note['revision'])
        self.store.message('user', 'Minha conversa')
        result = self.store.backup()
        with zipfile.ZipFile(result['path']) as archive:
            names = archive.namelist()
            self.assertIn('vault/' + note_id, names)
            self.assertTrue(any(name.startswith('history/') for name in names))
            self.assertEqual(json.loads(archive.read('state.json'))['messages'][0]['content'], 'Minha conversa')
            self.assertEqual(archive.read('vault/' + note_id).decode(), 'Depois')
            self.assertFalse(any(name.startswith(('workspace/', '.gemini/')) for name in names))
            self.assertEqual(archive.testzip(), None)

    def test_docs_import_preserves_existing_user_notes(self):
        existing = self.store.vault / 'wiki/cerebro-jarvis.md'
        existing.write_text('# Meu cérebro pessoal', encoding='utf-8')
        copied = self.store.seed_docs()
        self.assertGreater(len(copied), 0)
        self.assertNotIn('cerebro-jarvis.md', copied)
        self.assertEqual(existing.read_text(encoding='utf-8'), '# Meu cérebro pessoal')
        self.assertEqual(self.store.seed_docs(), [])

    def test_large_note_is_not_truncated_during_edit(self):
        path = self.store.vault / 'raw/large.md'
        content = '# Grande\n' + 'memória ' * 4000
        path.write_text(content, encoding='utf-8')
        selected = self.store.read_note('raw/large.md')
        self.assertEqual(selected['content'], content)
        edited = self.store.update_note(selected['id'], content + 'Fim', selected['revision'])
        self.assertTrue(edited['content'].endswith('Fim'))

    def test_search_weights_title_ignores_stopwords_and_matches_words(self):
        self.store.note('Python', 'Linguagem para projetos')
        self.store.note('Estudos', 'Python e programação')
        self.assertEqual(self.store.notes('para')[0]['score'], 0)
        self.assertEqual(self.store.notes('Python')[0]['title'], 'Python')
        self.assertEqual(self.store.notes('yth'), [])

    def test_workspace_http_endpoints_and_conflict_status(self):
        http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        http.store, http.token = self.store, 'workspace-test'
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{http.server_port}'

        def post(path, data):
            request = Request(base + '/api/' + path, data=json.dumps(data).encode(), headers={'X-Jarvis-Token': 'workspace-test', 'Content-Type': 'application/json'})
            with urlopen(request) as response:
                return json.load(response)

        try:
            for path in ('/workspace.js', '/workspace.css'):
                with urlopen(base + path) as response:
                    self.assertEqual(response.status, 200)
            note_id = post('note', {'title': 'Plano', 'content': 'Original'})['id']
            note = post('note-read', {'id': note_id})
            updated = post('note-update', {'id': note_id, 'content': 'Editado', 'revision': note['revision']})
            self.assertEqual(updated['content'], 'Editado')
            try:
                post('note-update', {'id': note_id, 'content': 'Obsoleto', 'revision': note['revision']})
                self.fail('Conflito não detectado')
            except HTTPError as error:
                self.assertEqual(error.code, 409)
                error.close()
            history = post('note-history', {'id': note_id})['versions']
            restored = post('note-restore', {'id': note_id, 'version': history[0]['id'], 'revision': updated['revision']})
            self.assertEqual(restored['content'], note['content'])
            self.assertTrue(Path(post('backup', {})['path']).exists())
            with patch.object(server, 'ask_gemini', return_value='Plano pronto'):
                reply = post('chat', {'text': 'Plano'})
                self.assertEqual(reply['sources'][0]['id'], note_id)
            with patch.object(server, 'diagnostics', return_value={'login': 'Não testado'}):
                self.assertEqual(post('diagnostics', {})['login'], 'Não testado')
            with patch.object(server, 'ask_gemini', return_value='OK'):
                self.assertTrue(post('gemini-check', {})['ok'])
            self.assertEqual(len(self.store.state['messages']), 2)
        finally:
            http.shutdown()
            http.server_close()
            thread.join()

    def test_local_cli_package_entry_is_read_from_metadata(self):
        root = Path(self.temp.name)
        package = root / '.tools/node_modules/@google/gemini-cli'
        package.mkdir(parents=True)
        (package / 'package.json').write_text(json.dumps({'bin': {'gemini': 'bundle/gemini.js'}}))
        with patch.object(server, 'cli_root', return_value=root), patch.object(server.shutil, 'which', return_value='node'):
            self.assertEqual(server.gemini_command(), ['node', str(package / 'bundle/gemini.js')])


if __name__ == '__main__':
    unittest.main()
