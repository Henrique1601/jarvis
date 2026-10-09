import json
import tempfile
from types import SimpleNamespace
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import subprocess
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
    def test_gemini_stdin_and_error(self):
        result=subprocess.CompletedProcess([],0,json.dumps({'response':'Olá Henrique'}),'')
        with patch.object(server, 'gemini_command', return_value=['gemini']), patch.object(server.subprocess, 'run', return_value=result) as run:
            self.assertEqual(server.ask_gemini(self.store, '$(danger)'), 'Olá Henrique')
            args, kwargs=run.call_args
            self.assertNotIn('$(danger)', args[0])
            self.assertIn('$(danger)', kwargs['input'])
            self.assertNotIn('GEMINI_API_KEY', kwargs['env'])
        with patch.object(server, 'gemini_command', return_value=['gemini']), patch.object(server.subprocess,'run',return_value=subprocess.CompletedProcess([],1,'{"error":{"message":"quota"}}','')):
            with self.assertRaises(RuntimeError):
                server.ask_gemini(self.store,'Oi')
    def test_windows_node_entry(self):
        package=Path(self.temp.name)/'node_modules'/'@google'/'gemini-cli'
        package.mkdir(parents=True)
        (package/'package.json').write_text('{"bin":{"gemini":"dist/index.js"}}')
        with patch.object(server, 'cli_root', return_value=Path(self.temp.name)), patch.object(server,'os',SimpleNamespace(name='nt')), patch.object(server.shutil,'which',side_effect=lambda name: str(Path(self.temp.name)/'gemini.cmd') if name=='gemini' else 'node'):
            command=server.gemini_command()
            self.assertEqual(command,['node',str(package/'dist/index.js')])
    def test_api_and_origin_token(self):
        http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        http.store,http.token=self.store,'test-token'
        thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
        base=f'http://127.0.0.1:{http.server_port}'
        try:
            self.assertEqual(urlopen(base+'/').status,200)
            self.assertEqual(json.load(urlopen(base+'/api/state'))['token'],'test-token')
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
            with patch.object(server,'ask_gemini',return_value='Resposta de teste'):
                msg=json.load(post('chat',{'text':'Olá'}))
                self.assertEqual(msg['content'],'Resposta de teste')
            self.assertEqual(len(self.store.state['messages']),2)
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(base+'/',headers={'Host':'evil.example'}))
            error.exception.close()
        finally:
            http.shutdown();http.server_close();thread.join()

if __name__=='__main__':unittest.main()
