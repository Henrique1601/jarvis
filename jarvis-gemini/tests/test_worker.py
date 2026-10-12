"""Worker regressions use fake HTTPS and a fake model, never real accounts."""
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

import antigravity_runtime as runtime
import worker

ID = '11111111-1111-4111-8111-111111111111'
ATTEMPT = '22222222-2222-4222-8222-222222222222'
DEVICE = '33333333-3333-4333-8333-333333333333'


def fake_protector(raw, decrypt=False):
    # Deliberately distinguish ciphertext for tests; production always uses DPAPI.
    return raw[7:][::-1] if decrypt else b'cipher:' + raw[::-1]


class FakeClient:
    def __init__(self, callbacks=None):
        self.credentials = {'deviceId': DEVICE}
        self.calls = []
        self.callbacks = callbacks or {}
        self.requester = lambda *args: {'provider': 'antigravity_windows', 'ok': True, 'worker': {'status': 'ready'}}

    def token(self):
        return 'fake-token'

    def api(self, name, values):
        self.calls.append((name, dict(values)))
        if name in self.callbacks:
            callback = self.callbacks[name]
            return callback(values) if callable(callback) else callback
        if name == 'worker-start':
            return {'started': True, 'alreadyStarted': False}
        if name == 'worker-renew':
            return {'renewed': True}
        if name == 'worker-complete':
            return {'jobId': ID, 'status': 'completed'}
        if name == 'worker-fail':
            return {'jobId': ID, 'status': 'failed'}
        if name == 'worker-claim':
            return {'job': None}
        return {'ok': True}


class FakeEngine:
    def __init__(self, blocked=False):
        self.blocked = blocked
        self.sent = []
        self.probes = 0

    def probe(self, *args, **kwargs):
        self.probes += 1
        if self.blocked:
            raise runtime.PolicyBlockedError('tools not empty')
        return {'verified': True, 'agent': runtime.AGENT_NAME, 'tools': ['run_command']}

    def ask(self, root, workspace, prompt, *, timeout, before_send, cancel_event):
        if self.blocked:
            raise runtime.PolicyBlockedError('tools not empty')
        before_send()
        self.sent.append(prompt)
        return 'Resposta sintética acentuada.'


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.root = Path(self.temp.name)
        self.vault = worker.Vault(self.root / 'worker', fake_protector)
        self.client = FakeClient()
        self.engine = FakeEngine()
        self.service = worker.Worker(self.root, self.vault, self.client, self.engine)
        self.job = {'jobId': ID, 'attemptId': ATTEMPT, 'prompt': 'Pedido e contexto apenas online.', 'sources': []}

    def tearDown(self):
        self.temp.cleanup()

    def test_vault_is_atomic_and_encrypted_and_limits_files(self):
        self.vault.write('credentials', {'accessToken': 'secret-access', 'deviceToken': 'secret-device'})
        raw = self.vault.path('credentials').read_bytes()
        self.assertNotIn(b'secret-access', raw)
        self.assertEqual(self.vault.read('credentials')['deviceToken'], 'secret-device')
        self.assertEqual(list(self.vault.root.glob('*.tmp')), [])
        with self.assertRaises(worker.WorkerError):
            self.vault.path('../outside')
        with self.assertRaises(worker.WorkerError):
            self.vault.write('outbox', {'answer': 'x' * worker.MAX_RESPONSE_BYTES})

    def test_setup_errors_identify_phase_without_echoing_provider_or_credentials(self):
        for stage, status, expected in [('config', 503, 'configuração do site'),
            ('login', 400, 'login da conta Jarvis'), ('login', 401, 'login da conta Jarvis'),
            ('login', 429, 'limite de tentativas'), ('register', 403, 'registrar o dispositivo'),
            ('register', 503, 'registrar o dispositivo'), ('config', None, 'configuração do site')]:
            with self.subTest(stage=stage, status=status):
                def failed(*args, **kwargs):
                    raise worker.WorkerError('connection_error', 'PRIVATE_PROVIDER_TOKEN_AND_PASSWORD', status)
                with self.assertRaises(worker.WorkerError) as error:
                    worker.setup_request(failed, stage, 'https://example.test', {'password': 'PRIVATE_PASSWORD'})
                self.assertIn(expected, str(error.exception))
                self.assertNotIn('PRIVATE', str(error.exception))
                self.assertEqual(error.exception.status, status)
                if status in (400, 401):
                    self.assertEqual(error.exception.code, 'auth_required')
        with self.assertRaises(ValueError):
            worker.setup_request(lambda *args: {}, 'PRIVATE_INVALID_STAGE', 'https://example.test')

    def test_setup_registers_after_login_and_never_persists_password(self):
        calls = []
        def requester(url, payload=None, headers=None):
            calls.append(url)
            if url.endswith('/api/config'):
                return {'configured': True, 'supabaseUrl': 'https://project.supabase.co', 'supabaseAnonKey': 'sb_publishable_test'}
            if '/auth/v1/token?' in url:
                self.assertEqual(payload['password'], 'SYNTHETIC_PASSWORD')
                return {'access_token': 'fake-access', 'refresh_token': 'fake-refresh', 'expires_in': 3600}
            self.assertEqual(headers['Authorization'], 'Bearer fake-access')
            return {'deviceId': DEVICE, 'deviceToken': 'A' * 43}
        with patch('builtins.input', side_effect=['synthetic@example.test', 'SYNTHETIC_PASSWORD']), patch('builtins.print'):
            worker.setup(self.vault, requester)
        self.assertEqual(len(calls), 3)
        credentials = self.vault.read('credentials')
        self.assertEqual(credentials['deviceId'], DEVICE)
        self.assertNotIn('password', credentials)
        self.assertNotIn('SYNTHETIC_PASSWORD', json.dumps(credentials))
        with patch.object(self.vault, 'write', side_effect=OSError('PRIVATE_LOCAL_PATH')), patch('builtins.input', side_effect=['synthetic@example.test', 'SYNTHETIC_PASSWORD']):
            with self.assertRaisesRegex(worker.WorkerError, 'salvar a conexão protegida') as error:
                worker.setup(self.vault, requester)
            self.assertNotIn('PRIVATE_LOCAL_PATH', str(error.exception))

    @unittest.skipUnless(os.name == 'nt', 'Windows DPAPI')
    def test_real_dpapi_roundtrip_under_current_windows_user(self):
        data = b'fake session only - no actual credential'
        encrypted = worker.dpapi(data)
        self.assertNotIn(data, encrypted)
        self.assertEqual(worker.dpapi(encrypted, decrypt=True), data)
        with self.assertRaises(worker.WorkerError):
            worker.dpapi(b'invalid encrypted data', decrypt=True)

    @unittest.skipUnless(os.name == 'nt', 'Windows named mutex')
    def test_named_mutex_refuses_second_instance_and_releases_after_exit(self):
        with patch.object(worker.Path, 'home', return_value=self.root):
            with worker.SingleInstance():
                with self.assertRaises(worker.WorkerError):
                    with worker.SingleInstance():
                        self.fail('A second worker was admitted')
            with worker.SingleInstance():
                pass

    def test_policy_blocked_startup_never_claims_job(self):
        self.engine.blocked = True
        with self.assertRaisesRegex(worker.WorkerError, 'antes de buscar'):
            self.service.run()
        self.assertEqual(self.engine.sent, [])
        self.assertFalse(any(name == 'worker-claim' for name, _ in self.client.calls))
        self.assertEqual(self.client.calls[-1][1]['status'], 'blocked')
        self.assertEqual(self.client.calls[-1][1]['reason'], 'policy_unverified')

    def test_run_accepts_tool_inventory_before_claim_and_rejects_invalid_init(self):
        def claimed(_):
            self.service.stop.set()
            return {'job': None}
        self.client.callbacks['worker-claim'] = claimed
        self.service.run()
        self.assertEqual(self.engine.probes, 1)
        self.assertTrue(any(name == 'worker-claim' for name, _ in self.client.calls))
        self.client.calls.clear()
        self.service.stop.clear()
        self.engine.probe = lambda *args, **kwargs: {'verified': True, 'agent': runtime.AGENT_NAME, 'tools': [{}]}
        with self.assertRaises(worker.WorkerError):
            self.service.run()
        self.assertFalse(any(name == 'worker-claim' for name, _ in self.client.calls))

    def test_start_precedes_prompt_and_completion_clears_outbox(self):
        self.service.execute(self.job)
        names = [name for name, _ in self.client.calls]
        self.assertEqual(names, ['worker-start', 'worker-complete'])
        self.assertEqual(self.engine.sent, [self.job['prompt']])
        self.assertIsNone(self.vault.read('outbox'))
        self.assertEqual(list((self.vault.root / 'runs').iterdir()), [])

    def test_policy_failure_during_job_stops_dispatch_and_preserves_blocked_status(self):
        self.engine.blocked = True
        with self.assertRaises(worker.WorkerError):
            self.service.execute(self.job)
        self.assertEqual(self.engine.sent, [])
        self.assertFalse(any(name == 'worker-start' for name, _ in self.client.calls))
        self.assertEqual(self.service.status, 'blocked')
        self.assertEqual(self.client.calls[-1][1]['reason'], 'policy_unverified')

    def test_google_login_and_quota_errors_have_distinct_heartbeat_reasons(self):
        for message, code, reason in [
            ('Entre com sua conta Google no Antigravity antes de usar o Jarvis.', 'auth_required', 'login_required'),
            ('A cota do Antigravity foi atingida. Aguarde antes de tentar novamente.', 'quota_exceeded', 'quota_exceeded'),
        ]:
            with self.subTest(code=code):
                def failed(*args, **kwargs):
                    raise RuntimeError(message)
                self.engine.ask = failed
                with self.assertRaises(worker.WorkerError) as error:
                    self.service.execute(self.job)
                self.assertEqual(error.exception.code, code)
                self.assertEqual(self.client.calls[-1][1]['reason'], reason)

    def test_start_replay_missing_proof_or_network_failure_never_generates(self):
        def lost(_):
            raise worker.WorkerError('connection_error', 'lost acknowledgement')
        for response in ({'started': True, 'alreadyStarted': True}, {'started': True}, {'started': False}, lost):
            with self.subTest(response=response):
                self.client.calls.clear()
                self.client.callbacks['worker-start'] = response
                self.service.execute(self.job)
                self.assertEqual(self.engine.sent, [])
                self.assertEqual(self.client.calls[-1][0], 'worker-fail')
                self.assertEqual(self.client.calls[-1][1]['code'], 'result_uncertain')

    def test_completion_network_failure_retries_only_same_answer_never_model(self):
        count = 0
        def completion(values):
            nonlocal count
            count += 1
            if count == 1:
                raise worker.WorkerError('connection_error', 'offline')
            return {'jobId': ID, 'status': 'completed'}
        self.client.callbacks['worker-complete'] = completion
        with self.assertRaises(worker.WorkerError):
            self.service.execute(self.job)
        pending = self.vault.read('outbox')
        self.assertEqual(pending['stage'], 'answered')
        self.assertNotIn('prompt', pending)
        self.service.recover()
        self.assertEqual(len(self.engine.sent), 1)
        completions = [values for name, values in self.client.calls if name == 'worker-complete']
        self.assertEqual(completions[0], completions[1])
        self.assertIsNone(self.vault.read('outbox'))

    def test_expired_completion_becomes_terminal_and_cannot_regenerate(self):
        def expired(_):
            raise worker.WorkerError('connection_error', 'inactive attempt', 409)
        self.client.callbacks['worker-complete'] = expired
        with self.assertRaises(worker.WorkerError):
            self.service.execute(self.job)
        self.assertEqual(self.vault.read('outbox')['stage'], 'terminal')
        with self.assertRaisesRegex(worker.WorkerError, 'nenhuma nova geração'):
            self.service.recover()
        self.assertEqual(len(self.engine.sent), 1)

    def test_uncertain_restart_reports_failure_without_asking_model(self):
        self.vault.write('outbox', {'deviceId': DEVICE, 'jobId': ID, 'attemptId': ATTEMPT, 'stage': 'start_pending'})
        self.service.recover()
        self.assertEqual(self.client.calls[-1][0], 'worker-fail')
        self.assertEqual(self.client.calls[-1][1]['code'], 'result_uncertain')
        self.assertEqual(self.engine.sent, [])

    def test_wrong_device_and_malformed_completion_do_not_delete_result(self):
        self.vault.write('outbox', {'deviceId': ATTEMPT, 'jobId': ID, 'attemptId': ATTEMPT, 'stage': 'answered', 'answer': 'data'})
        with self.assertRaises(worker.WorkerError):
            self.service.recover()
        self.assertIsNotNone(self.vault.read('outbox'))
        self.vault.write('outbox', {'deviceId': DEVICE, 'jobId': ID, 'attemptId': ATTEMPT, 'stage': 'answered', 'answer': 'data'})
        self.client.callbacks['worker-complete'] = {'ok': True}
        with self.assertRaises(worker.WorkerError):
            self.service.recover()
        self.assertIsNotNone(self.vault.read('outbox'))

    def test_stop_cancels_generation_cooperatively_and_never_completes(self):
        def wait_engine(root, workspace, prompt, *, timeout, before_send, cancel_event):
            before_send()
            self.service.stop.set()
            self.assertTrue(cancel_event.wait(2))
            raise RuntimeError('cancelled')
        self.engine.ask = wait_engine
        self.service.execute(self.job)
        self.assertFalse(any(name == 'worker-complete' for name, _ in self.client.calls))
        self.assertEqual(self.client.calls[-1][1]['code'], 'result_uncertain')

    def test_paused_worker_sends_heartbeat_and_never_probes_or_claims(self):
        self.vault.write('preferences', {'paused': True})
        self.service.run()
        self.assertEqual(self.engine.probes, 0)
        self.assertEqual(self.client.calls, [('worker-heartbeat', {'status': 'paused', 'reason': 'none'})])

    def test_token_refresh_is_persisted_encrypted_and_only_device_header_is_sent(self):
        credentials = {'origin': worker.ORIGIN, 'supabaseUrl': 'https://project.supabase.co', 'publicKey': 'sb_publishable_test',
            'accessToken': 'old-access', 'refreshToken': 'fake-refresh', 'expiresAt': 0, 'deviceId': DEVICE, 'deviceToken': 'd'*43}
        self.vault.write('credentials', credentials)
        calls = []
        def requester(url, payload=None, headers=None):
            calls.append((url, payload, headers))
            if '/auth/v1/token?' in url:
                return {'access_token': 'new-access', 'refresh_token': 'new-refresh', 'expires_in': 3600}
            return {'ok': True}
        client = worker.Client(self.vault, requester)
        client.api('worker-heartbeat', {'status': 'blocked', 'reason': 'policy_unverified'})
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[1][2]['Authorization'], 'Bearer new-access')
        self.assertEqual(calls[1][2]['X-Jarvis-Device-Token'], 'd'*43)
        self.assertNotIn('deviceToken', calls[1][1])
        self.assertEqual(self.vault.read('credentials')['refreshToken'], 'new-refresh')
        self.assertNotIn(b'new-refresh', self.vault.path('credentials').read_bytes())

    def test_redirect_and_unsafe_origins_are_refused(self):
        self.assertIsNone(worker.NoRedirect().redirect_request(None, None, None, None, None, None))
        for origin in ['http://project.supabase.co', 'https://project.supabase.co@evil.test', 'https://evil.test',
                       'https://project.supabase.co/path', 'https://project.supabase.co?x=y']:
            with self.assertRaises(worker.WorkerError):
                worker.validate_supabase(origin)
        with patch.object(urllib.request, 'build_opener') as opener:
            opener.return_value.open.side_effect = urllib.error.HTTPError('https://private', 302, 'private secret', {}, None)
            with self.assertRaises(worker.WorkerError) as error:
                worker.request_json(worker.ORIGIN + '/api/worker-start', {})
            self.assertNotIn('private secret', str(error.exception))

    def test_startup_accepts_cli_tools_and_requires_online_gate_before_any_task(self):
        self.engine.blocked = True
        with self.assertRaises(runtime.PolicyBlockedError):
            worker.startup_check(self.root, self.vault, self.client, self.engine)
        self.assertEqual(self.client.calls, [])
        self.engine.blocked = False
        self.client.requester = lambda *args: {'provider': 'antigravity_windows', 'ok': False, 'worker': {'status': 'blocked'}}
        with self.assertRaises(worker.WorkerError):
            worker.startup_check(self.root, self.vault, self.client, self.engine)
        self.client.requester = lambda *args: {'provider': 'gemini_api', 'ok': True, 'worker': {'status': 'ready'}}
        with self.assertRaises(worker.WorkerError):
            worker.startup_check(self.root, self.vault, self.client, self.engine)
        self.client.requester = lambda *args: {'provider': 'antigravity_windows', 'ok': True, 'worker': {'status': 'ready'}}
        self.assertTrue(worker.startup_check(self.root, self.vault, self.client, self.engine))
        self.assertEqual(self.engine.sent, [])
        self.assertFalse(any(name == 'worker-claim' for name, _ in self.client.calls))

    def test_startup_script_has_limited_interactive_hidden_task_and_pins_paths(self):
        script = (Path(__file__).parent.parent / 'INICIALIZACAO-WORKER.ps1').read_text(encoding='utf-8')
        self.assertLess(script.index('$jarvisWorker startup-check'), script.index('Register-ScheduledTask -TaskName'))
        self.assertIn('if ($LASTEXITCODE -ne 0)', script)
        self.assertIn('-LogonType Interactive -RunLevel Limited', script)
        self.assertIn('-Hidden -MultipleInstances IgnoreNew', script)
        self.assertIn('-Execute $jarvisPythonW', script)
        self.assertIn('[IO.Path]::IsPathRooted($jarvisPython)', script)
        self.assertIn('Unregister-ScheduledTask', script)
        self.assertIn("'Status'", script)
        self.assertNotIn('Start-ScheduledTask', script)
        self.assertNotIn('-Password', script)
        self.assertNotIn('-RunLevel Highest', script)

    def test_diagnostics_returns_safe_state_without_secrets(self):
        self.vault.write('credentials', {'deviceId': DEVICE, 'accessToken': 'secret-token-value', 'deviceToken': 'secret-dev'})
        self.vault.write('preferences', {'paused': True})
        self.vault.write('outbox', {'stage': 'answered', 'jobId': ID})
        diag = worker.diagnostics(self.root, self.vault)
        self.assertEqual(diag['credentials'], 'Configurado')
        self.assertEqual(diag['deviceId'], DEVICE[:8] + '...')
        self.assertTrue(diag['paused'])
        self.assertEqual(diag['outbox'], 'Pendente (answered)')
        self.assertNotIn('secret-token-value', json.dumps(diag))

    def test_backoff_on_transient_connection_errors(self):
        waits = []
        claims = 0

        def fake_wait(seconds):
            waits.append(seconds)
            if len(waits) >= 4:
                self.service.stop.set()
            return self.service.stop.is_set()

        def failing_claim(_):
            nonlocal claims
            claims += 1
            if claims <= 3:
                raise worker.WorkerError('connection_error', 'network unreachable')
            return {'job': None}

        self.client.callbacks['worker-claim'] = failing_claim
        with patch.object(self.service.stop, 'wait', side_effect=fake_wait):
            self.service.run()

        # First 3 failures increase or sustain wait time, 4th succeeds and resets to POLL_SECONDS
        self.assertEqual(len(waits), 4)
        self.assertGreaterEqual(waits[1], worker.POLL_SECONDS)
        self.assertGreater(waits[2], worker.POLL_SECONDS)
        self.assertEqual(waits[3], worker.POLL_SECONDS)


if __name__ == '__main__':
    unittest.main()
