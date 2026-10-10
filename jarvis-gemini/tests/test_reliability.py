"""Failure recovery with simulated CLI/voice; no account or microphone required."""
import json
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import server


class StoreFixture(unittest.TestCase):
    def setUp(self):
        self.test_root = Path(__file__).resolve().parent
        self.temp = tempfile.TemporaryDirectory(dir=self.test_root)
        self.addCleanup(self.temp.cleanup)
        self.store = server.Store(self.temp.name)


class AiWrapperTests(StoreFixture):
    def test_runtime_safe_errors_preserve_guidance_without_persisting_messages(self):
        messages = (
            'O Antigravity demorou mais de 3 minutos. Tente novamente.',
            'Confira o login do Antigravity e sua conexão.',
            'Não foi possível iniciar o Antigravity. Confira a instalação.',
            'O Antigravity retornou um formato inesperado. Tente novamente.',
            'O Antigravity não retornou uma resposta de texto.',
        )
        for message in messages:
            with self.subTest(message=message):
                with patch.object(server.antigravity, 'ask', side_effect=RuntimeError(message)):
                    with self.assertRaises(RuntimeError) as raised:
                        server.ask_ai(self.store, 'Pedido de teste')
                self.assertEqual(str(raised.exception), message)
                self.assertNotIn('synthetic-private-stdout', str(raised.exception))
                self.assertNotIn('synthetic-private-stderr', str(raised.exception))
                self.assertEqual(self.store.state['messages'], [])

    def test_generated_context_is_delegated_to_runtime(self):
        note_id = self.store.note('Memória relevante', 'evidenciaantigravity confirmada')
        text = 'Explique evidenciaantigravity'
        captured = {}
        def fake_ask(app_root, workspace, prompt, timeout=180):
            captured.update(prompt=prompt, app_root=app_root, workspace=workspace, timeout=timeout)
            return 'Resposta simulada'
        with patch.object(server.antigravity, 'ask', side_effect=fake_ask):
            self.assertEqual(server.ask_ai(self.store, text), 'Resposta simulada')
        suffix = '\nPedido atual: ' + text
        prompt = captured['prompt']
        sent = json.loads(prompt[len(server.PROMPT_INSTRUCTIONS):-len(suffix)])
        self.assertTrue(prompt.startswith(server.PROMPT_INSTRUCTIONS))
        self.assertTrue(prompt.endswith(suffix))
        self.assertEqual(sent['notas'][0]['arquivo'], note_id)
        self.assertIn('evidenciaantigravity', sent['notas'][0]['trechos'][0]['texto'])
        self.assertEqual(captured['app_root'], server.app_root())
        self.assertEqual(captured['workspace'], self.store.workspace)
        self.assertEqual(captured['timeout'], 180)
        self.assertLessEqual(len(prompt), server.PROMPT_MAX_CHARS)
        self.assertEqual(self.store.state['messages'], [])

    def test_prepared_prompt_does_not_trigger_context_regeneration(self):
        captured = []
        prepared = 'Contexto pronto\nPedido atual: Pedido de teste'
        def fake_ask(app_root, workspace, prompt, timeout=180):
            captured.append(prompt)
            return 'Resposta simulada'
        with patch.object(server.antigravity, 'ask', side_effect=fake_ask), \
                patch.object(self.store, 'prompt', side_effect=AssertionError('Contexto foi regenerado.')):
            self.assertEqual(server.ask_ai(self.store, 'Pedido de teste', prepared_prompt=prepared), 'Resposta simulada')
        self.assertEqual(captured, [prepared])


class HttpRecoveryTests(StoreFixture):
    def setUp(self):
        super().setUp()
        self.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.http.store, self.http.token = self.store, 'reliability-test-token'
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_http)
        self.base = f'http://127.0.0.1:{self.http.server_port}/api/'

    def stop_http(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join(timeout=5)
        self.assertFalse(self.thread.is_alive())

    def post(self, route, data):
        request = Request(self.base + route, data=json.dumps(data).encode(),
                          headers={'X-Jarvis-Token': self.http.token,
                                   'Content-Type': 'application/json'})
        try:
            with urlopen(request, timeout=10) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            try:
                return error.code, json.load(error)
            finally:
                error.close()

    def assert_no_persisted_messages(self):
        self.assertEqual(self.store.state['messages'], [])
        if self.store.state_file.exists():
            state = json.loads(self.store.state_file.read_text(encoding='utf-8'))
            self.assertEqual(state['messages'], [])

    def assert_success_pair_persisted(self):
        state = json.loads(self.store.state_file.read_text(encoding='utf-8'))
        self.assertEqual([(msg['role'], msg['content']) for msg in state['messages']],
                         [('user', 'Depois da falha'), ('assistant', 'Resposta recuperada')])

    def test_chat_failure_releases_ai_lock_and_next_request_succeeds(self):
        with patch.object(server.antigravity, 'ask', side_effect=RuntimeError('Confira o login.')):
            status, result = self.post('chat', {'text': 'Pedido que falha'})
        self.assertEqual(status, 400)
        self.assertIn('login', result['error'])
        self.assertFalse(server.AI_LOCK.locked())
        self.assert_no_persisted_messages()
        with patch.object(server.antigravity, 'ask', return_value='Resposta recuperada'):
            status, result = self.post('chat', {'text': 'Depois da falha'})
        self.assertEqual(status, 200)
        self.assertEqual(result['content'], 'Resposta recuperada')
        self.assert_success_pair_persisted()

    def test_ai_check_failure_releases_ai_lock_and_retry_succeeds(self):
        with patch.object(server.antigravity, 'ask', side_effect=RuntimeError('Confira o login.')):
            status, _ = self.post('ai-check', {})
        self.assertEqual(status, 400)
        self.assertFalse(server.AI_LOCK.locked())
        self.assert_no_persisted_messages()
        with patch.object(server.antigravity, 'ask', return_value='OK'):
            status, result = self.post('ai-check', {})
        self.assertEqual(status, 200)
        self.assertTrue(result['ok'])
        self.assert_no_persisted_messages()

    def test_ai_check_and_legacy_alias_do_not_send_personal_memory(self):
        private_marker = 'synthetic-personal-memory'
        self.store.note('Memória privada', private_marker)
        self.store.message('user', private_marker)
        baseline = list(self.store.state['messages'])
        prompts = []
        def fake_ask(app_root, workspace, prompt, timeout=180):
            prompts.append(prompt)
            return 'OK'
        with patch.object(server.antigravity, 'ask', side_effect=fake_ask):
            for route in ('ai-check', 'gemini-check'):
                with self.subTest(route=route):
                    status, result = self.post(route, {})
                    self.assertEqual(status, 200)
                    self.assertTrue(result['ok'])
        self.assertEqual(len(prompts), 2)
        self.assertEqual(prompts[0], prompts[1])
        for prompt in prompts:
            self.assertNotIn(private_marker, prompt)
        self.assertEqual(self.store.state['messages'], baseline)

    def test_chat_sends_late_evidence_and_reports_exact_serialized_sources(self):
        evidence = 'evidenciaantigravity'
        content = ('# Pesquisa de incidente\n\n'
                   + 'Registro diário sem relação com o pedido atual.\n' * 800
                   + '\nA solução confirmada foi evidenciaantigravity na configuração local.\n')
        note_id = 'raw/incidente-longo.md'
        (self.store.vault / note_id).write_text(content, encoding='utf-8')
        self.store.note('Outra memória', 'Informações sem relação com o incidente.')
        self.assertGreater(content.index(evidence), 20000)
        request_text = 'Explique a evidenciaantigravity'
        captured = []
        def fake_ask(app_root, workspace, prompt, timeout=180):
            captured.append(prompt)
            return 'Resposta simulada'

        # Mock the runtime boundary: Handler, retrieval and assembly run normally.
        with patch.object(server.antigravity, 'ask', side_effect=fake_ask) as ask:
            status, reply = self.post('chat', {'text': request_text})

        self.assertEqual(status, 200)
        ask.assert_called_once()
        serialized = captured[0]
        suffix = '\nPedido atual: ' + request_text
        self.assertTrue(serialized.startswith(server.PROMPT_INSTRUCTIONS))
        self.assertTrue(serialized.endswith(suffix))
        self.assertLessEqual(len(serialized), server.PROMPT_MAX_CHARS)
        sent = json.loads(serialized[len(server.PROMPT_INSTRUCTIONS):-len(suffix)])
        self.assertEqual([note['arquivo'] for note in sent['notas']], [note_id])
        self.assertTrue(any(evidence in excerpt['texto']
                            for note in sent['notas'] for excerpt in note['trechos']))
        for note in sent['notas']:
            original = (self.store.vault / note['arquivo']).read_text(encoding='utf-8')
            for excerpt in note['trechos']:
                start, end = excerpt['inicio'] - 1, excerpt['fim']
                self.assertEqual(excerpt['texto'], original[start:end])
                self.assertEqual(excerpt['linha_inicio'], original.count('\n', 0, start) + 1)
                self.assertEqual(excerpt['linha_fim'], original.count('\n', 0, end - 1) + 1)
        expected_sources = [{'id': note['arquivo'], 'title': note['titulo']} for note in sent['notas']]
        self.assertEqual(reply['sources'], expected_sources)
        persisted = json.loads(self.store.state_file.read_text(encoding='utf-8'))
        self.assertEqual(persisted['messages'][-1]['sources'], expected_sources)
        self.assertEqual([(msg['role'], msg['content']) for msg in persisted['messages']],
                         [('user', request_text), ('assistant', 'Resposta simulada')])

    def assert_concurrent_ai_failure_recovers(self, first_route, second_route):
        entered, release = threading.Event(), threading.Event()

        def delayed_failure(*args, **kwargs):
            entered.set()
            if not release.wait(timeout=5):
                raise AssertionError('O teste não liberou o pedido simulado.')
            raise RuntimeError('Falha simulada; confira o login.')

        with patch.object(server.antigravity, 'ask', side_effect=delayed_failure) as ask:
            with ThreadPoolExecutor(max_workers=1) as pool:
                first = pool.submit(self.post, first_route, {'text': 'Pedido que falha'})
                try:
                    self.assertTrue(entered.wait(timeout=5), 'Primeiro pedido não chegou ao modelo.')
                    status, result = self.post(second_route, {'text': 'Pedido concorrente'})
                    self.assertEqual(status, 409)
                    self.assertIn('error', result)
                    self.assertEqual(ask.call_count, 1)
                    self.assert_no_persisted_messages()
                finally:
                    release.set()
                status, _ = first.result(timeout=5)
                self.assertEqual(status, 400)
        self.assertFalse(server.AI_LOCK.locked())
        self.assert_no_persisted_messages()
        with patch.object(server.antigravity, 'ask', return_value='Resposta recuperada'):
            status, _ = self.post('chat', {'text': 'Depois da falha'})
        self.assertEqual(status, 200)
        self.assert_success_pair_persisted()

    def test_chat_blocks_concurrent_ai_check_and_recovers(self):
        self.assert_concurrent_ai_failure_recovers('chat', 'ai-check')

    def test_ai_check_blocks_concurrent_chat_and_recovers(self):
        self.assert_concurrent_ai_failure_recovers('ai-check', 'chat')

    def test_speak_failure_releases_voice_lock_and_retry_succeeds(self):
        with patch.object(server, 'speak', side_effect=RuntimeError('Falha de voz simulada.')):
            status, _ = self.post('speak', {'text': 'Olá'})
        self.assertEqual(status, 400)
        self.assertFalse(server.VOICE_LOCK.locked())
        with patch.object(server, 'speak', return_value=None) as speak:
            status, result = self.post('speak', {'text': 'Tentar novamente'})
        self.assertEqual(status, 200)
        self.assertTrue(result['ok'])
        speak.assert_called_once_with('Tentar novamente')
        self.assert_no_persisted_messages()


if __name__ == '__main__':
    unittest.main()
