import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import server

class Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.store = server.Store(Path(self.temp.name))
    def tearDown(self):
        self.assertTrue(Path(self.temp.name).resolve().is_relative_to(Path(__file__).resolve().parent))
        self.temp.cleanup()
    def test_memory_search_accents_and_persistence(self):
        self.store.note('Inteligência artificial', 'Aprendizagem supervisionada em Python')
        self.assertEqual(len(self.store.notes('inteligencia')), 1)
        self.assertEqual(len(self.store.notes('supervisionada')), 1)
        self.assertEqual(self.store.notes('inexistente'), [])
        self.store.message('user', 'Olá')
        restored = server.Store(self.temp.name)
        self.assertEqual(restored.state['messages'][0]['content'], 'Olá')
        self.assertIn('Aprendizagem supervisionada', restored.prompt('inteligencia'))
    def test_folder_validation(self):
        with self.assertRaises(ValueError):
            self.store.note('X','Y','../../')
        with self.assertRaises(ValueError):
            self.store.note('X','')
    def test_ai_prompt_delegation_and_error(self):
        captured = {}
        def fake_ask(app_root, workspace, prompt, timeout=180):
            captured.update(app_root=app_root, workspace=workspace, prompt=prompt, timeout=timeout)
            return 'Olá Henrique'
        with patch.object(server.antigravity, 'ask', side_effect=fake_ask):
            self.assertEqual(server.ask_ai(self.store, '$(danger)'), 'Olá Henrique')
        self.assertEqual(captured['app_root'], server.app_root())
        self.assertEqual(captured['workspace'], self.store.workspace)
        self.assertIn('$(danger)', captured['prompt'])
        self.assertEqual(captured['timeout'], 180)
        with patch.object(server.antigravity, 'ask', side_effect=RuntimeError('Confira o login do Antigravity.')):
            with self.assertRaisesRegex(RuntimeError, 'Antigravity'):
                server.ask_ai(self.store, 'Oi')
    def test_ai_prepared_prompt_is_sent_unchanged(self):
        prepared = 'Contexto preparado\nPedido atual: Olá'
        captured = []
        def fake_ask(app_root, workspace, prompt, timeout=180):
            captured.append(prompt)
            return 'Resposta de teste'
        with patch.object(server.antigravity, 'ask', side_effect=fake_ask), \
                patch.object(self.store, 'prompt', side_effect=AssertionError('Não gere outro contexto.')):
            self.assertEqual(server.ask_ai(self.store, 'Olá', prepared_prompt=prepared), 'Resposta de teste')
        self.assertEqual(captured, [prepared])
    def test_api_and_origin_token(self):
        http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        http.store,http.token=self.store,'test-token'
        thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
        base=f'http://127.0.0.1:{http.server_port}'
        try:
            self.assertEqual(urlopen(base+'/').status,200)
            with patch.object(server.antigravity, 'available', return_value=True):
                with urlopen(base+'/api/state') as response:
                    state = json.load(response)
            self.assertEqual(state['token'],'test-token')
            self.assertEqual(state['provider'],'Antigravity CLI')
            self.assertTrue(state['aiInstalled'])
            def post(path, data, headers=None):
                return urlopen(Request(base+'/api/'+path,data=json.dumps(data).encode(),headers=headers or {'X-Jarvis-Token':'test-token','Content-Type':'application/json'}))
            with self.assertRaises(HTTPError) as error:
                post('note',{'title':'X','content':'Y'},{'Origin':'https://example.com','X-Jarvis-Token':'test-token'})
            self.assertEqual(error.exception.code,403)
            error.exception.close()
            with self.assertRaises(HTTPError) as error:
                post('task',{'text':'X'},{'Content-Type':'application/json'})
            error.exception.close()
            note=json.load(post('note',{'title':'Plano','content':'Estudar IA'}))
            self.assertTrue(note['id'].endswith('.md'))
            task=json.load(post('task',{'text':'Estudar'}))
            json.load(post('task',{'id':task['id'],'done':True}))
            self.assertTrue(self.store.state['tasks'][0]['done'])
            with patch.object(server.antigravity,'ask',return_value='Resposta de teste'):
                msg=json.load(post('chat',{'text':'Olá'}))
                self.assertEqual(msg['content'],'Resposta de teste')
            self.assertEqual(len(self.store.state['messages']),2)
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(base+'/',headers={'Host':'evil.example'}))
            error.exception.close()
        finally:
            http.shutdown();http.server_close();thread.join()

if __name__=='__main__':unittest.main()
