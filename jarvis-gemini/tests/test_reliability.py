"""Failure recovery with simulated CLI/voice; no account or microphone required."""
import json
import subprocess
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


class GeminiResponseTests(StoreFixture):
    OUTPUT_MARKER = 'synthetic-private-stdout'
    ERROR_MARKER = 'synthetic-private-stderr'

    def assert_safe_cli_error(self, result, expected_hint='login'):
        with patch.object(server, 'gemini_command', return_value=['simulated-gemini']), \
                patch.object(server.subprocess, 'run', return_value=result):
            with self.assertRaises(RuntimeError) as raised:
                server.ask_gemini(self.store, 'Pedido de teste')
        message = str(raised.exception)
        self.assertNotIn(self.OUTPUT_MARKER, message)
        self.assertNotIn(self.ERROR_MARKER, message)
        self.assertIn(expected_hint.lower(), message.lower())
        self.assertEqual(self.store.state['messages'], [])

    def test_timeout_is_safe_and_explains_retry(self):
        failure = subprocess.TimeoutExpired(['simulated-gemini'], 180,
                                            output=self.OUTPUT_MARKER, stderr=self.ERROR_MARKER)
        with patch.object(server, 'gemini_command', return_value=['simulated-gemini']), \
                patch.object(server.subprocess, 'run', side_effect=failure):
            with self.assertRaises(RuntimeError) as raised:
                server.ask_gemini(self.store, 'Pedido de teste')
        message = str(raised.exception)
        self.assertNotIn(self.OUTPUT_MARKER, message)
        self.assertNotIn(self.ERROR_MARKER, message)
        self.assertIn('minut', message.lower())
        self.assertIn('tente', message.lower())
        self.assertEqual(self.store.state['messages'], [])

    def test_invalid_json_is_safe_and_explains_login(self):
        result = subprocess.CompletedProcess([], 0, self.OUTPUT_MARKER, self.ERROR_MARKER)
        self.assert_safe_cli_error(result)

    def test_cli_start_oserror_is_safe_and_explains_configuration(self):
        failure = OSError(self.OUTPUT_MARKER + ' ' + self.ERROR_MARKER)
        with patch.object(server, 'gemini_command', return_value=['simulated-gemini']), \
                patch.object(server.subprocess, 'run', side_effect=failure):
            with self.assertRaises(RuntimeError) as raised:
                server.ask_gemini(self.store, 'Pedido de teste')
        message = str(raised.exception)
        self.assertIn('Node', message)
        self.assertIn('CONFIGURAR-GEMINI.bat', message)
        self.assertNotIn(self.OUTPUT_MARKER, message)
        self.assertNotIn(self.ERROR_MARKER, message)
        self.assertEqual(self.store.state['messages'], [])

    def test_unexpected_json_shapes_are_safe_and_explain_format(self):
        for payload in ([self.OUTPUT_MARKER], None, self.OUTPUT_MARKER):
            with self.subTest(payload_type=type(payload).__name__):
                result = subprocess.CompletedProcess([], 0, json.dumps(payload), self.ERROR_MARKER)
                self.assert_safe_cli_error(result, expected_hint='formato')

    def test_cli_exit_and_error_payload_are_safe_and_explain_login(self):
        for returncode, payload in ((1, {'response': self.OUTPUT_MARKER}),
                                    (41, {'error': {'message': self.OUTPUT_MARKER}}),
                                    (0, {'error': {'message': self.OUTPUT_MARKER}})):
            with self.subTest(returncode=returncode, error_payload='error' in payload):
                result = subprocess.CompletedProcess([], returncode, json.dumps(payload), self.ERROR_MARKER)
                hint = 'CONFIGURAR-GEMINI.bat' if returncode == 41 else 'login'
                self.assert_safe_cli_error(result, expected_hint=hint)

    def test_missing_empty_or_nontext_response_explains_missing_text(self):
        for payload in ({}, {'response': ''}, {'response': ' \n\t'},
                        {'response': None}, {'response': 123}):
            with self.subTest(payload=payload):
                result = subprocess.CompletedProcess([], 0, json.dumps(payload), self.ERROR_MARKER)
                self.assert_safe_cli_error(result, expected_hint='resposta de texto')


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
        with patch.object(server, 'ask_gemini', side_effect=RuntimeError('Confira o login.')):
            status, result = self.post('chat', {'text': 'Pedido que falha'})
        self.assertEqual(status, 400)
        self.assertIn('login', result['error'])
        self.assertFalse(server.AI_LOCK.locked())
        self.assert_no_persisted_messages()
        with patch.object(server, 'ask_gemini', return_value='Resposta recuperada'):
            status, result = self.post('chat', {'text': 'Depois da falha'})
        self.assertEqual(status, 200)
        self.assertEqual(result['content'], 'Resposta recuperada')
        self.assert_success_pair_persisted()

    def test_gemini_check_failure_releases_ai_lock_and_retry_succeeds(self):
        with patch.object(server, 'ask_gemini', side_effect=RuntimeError('Confira o login.')):
            status, _ = self.post('gemini-check', {})
        self.assertEqual(status, 400)
        self.assertFalse(server.AI_LOCK.locked())
        self.assert_no_persisted_messages()
        with patch.object(server, 'ask_gemini', return_value='OK'):
            status, result = self.post('gemini-check', {})
        self.assertEqual(status, 200)
        self.assertTrue(result['ok'])
        self.assert_no_persisted_messages()

    def test_chat_sends_late_evidence_and_reports_exact_serialized_sources(self):
        evidence = 'evidenciagemma'
        content = ('# Pesquisa de incidente\n\n'
                   + 'Registro diário sem relação com o pedido atual.\n' * 800
                   + '\nA solução confirmada foi evidenciagemma na configuração local.\n')
        note_id = 'raw/incidente-longo.md'
        (self.store.vault / note_id).write_text(content, encoding='utf-8')
        self.store.note('Outra memória', 'Informações sem relação com o incidente.')
        self.assertGreater(content.index(evidence), 20000)
        request_text = 'Explique a evidenciagemma'
        cli_result = subprocess.CompletedProcess([], 0, json.dumps({'response': 'Resposta simulada'}), '')

        # Mock only the process boundary: Handler, retrieval and prompt assembly
        # must all run normally for this request.
        with patch.object(server, 'gemini_command', return_value=['simulated-gemini']), \
                patch.object(server.subprocess, 'run', return_value=cli_result) as run:
            status, reply = self.post('chat', {'text': request_text})

        self.assertEqual(status, 200)
        run.assert_called_once()
        serialized = run.call_args.kwargs['input']
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

        with patch.object(server, 'ask_gemini', side_effect=delayed_failure) as ask:
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
        with patch.object(server, 'ask_gemini', return_value='Resposta recuperada'):
            status, _ = self.post('chat', {'text': 'Depois da falha'})
        self.assertEqual(status, 200)
        self.assert_success_pair_persisted()

    def test_chat_blocks_concurrent_gemini_check_and_recovers(self):
        self.assert_concurrent_ai_failure_recovers('chat', 'gemini-check')

    def test_gemini_check_blocks_concurrent_chat_and_recovers(self):
        self.assert_concurrent_ai_failure_recovers('gemini-check', 'chat')

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
