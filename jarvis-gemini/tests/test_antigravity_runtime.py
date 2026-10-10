"""Transport tests use a local Python fixture, never an authenticated CLI."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

import antigravity_runtime as runtime


FAKE_CLI = r'''
import json, pathlib, subprocess, sys, time
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
mode, receipt = sys.argv[1:3]
def emit(value):
    print(json.dumps(value), flush=True)
if mode == 'no_init':
    raise SystemExit(0)
if mode == 'timeout_init':
    time.sleep(5)
    raise SystemExit(0)
if mode == 'invalid_init':
    print('internal-secret-not-json', flush=True)
    time.sleep(5)
    raise SystemExit(0)
if mode == 'auth_first':
    emit({'event': 'result', 'result': {'status': 'ERROR', 'error': 'authentication required: internal-secret'}})
    sys.stdin.read()
    raise SystemExit(1)
if mode == 'unsafe_child':
    child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])
    pathlib.Path(receipt).write_text(str(child.pid), encoding='utf-8')
tools = ['run_command'] if mode in ('unsafe_tools', 'unsafe_child') else []
details = {'agent': 'wrong' if mode == 'wrong_agent' else 'jarvis-chat', 'tools': tools}
if mode == 'missing_tools':
    del details['tools']
if mode == 'wrong_tools_type':
    details['tools'] = ''
emit({'event': 'init', 'init': details})
if mode in ('unsafe_tools', 'wrong_agent', 'missing_tools', 'wrong_tools_type'):
    data = sys.stdin.read()
    pathlib.Path(receipt).write_text(data, encoding='utf-8')
    raise SystemExit(0)
if mode == 'timeout_writer':
    time.sleep(5)
    raise SystemExit(0)
data = sys.stdin.read()
pathlib.Path(receipt).write_text(data, encoding='utf-8')
if mode == 'timeout_turn':
    time.sleep(5)
    raise SystemExit(0)
if mode == 'missing_result':
    raise SystemExit(0)
if mode == 'invalid_result':
    print('internal-secret-not-json', flush=True)
    raise SystemExit(0)
if mode == 'overflow':
    print('x' * (300 * 1024), flush=True)
    raise SystemExit(0)
if mode == 'stderr':
    sys.stderr.write('internal-secret-log' * 15000)
    sys.stderr.flush()
emit({'event': 'step_update', 'step_update': {'state': 'DONE', 'step_type': 'user_input'}})
result = {'status': 'ERROR' if mode in ('failed', 'quota') else 'SUCCESS',
          'response': ' ' if mode == 'empty' else 'Olá Henrique'}
if mode == 'failed':
    result['error'] = 'internal-secret-failure'
if mode == 'quota':
    result['error'] = 'resource_exhausted: internal-secret-failure'
if mode == 'missing_status':
    del result['status']
emit({'event': 'result', 'result': result})
if mode == 'duplicate_result':
    emit({'event': 'result', 'result': result})
if mode == 'timeout_exit':
    sys.stdout.close()
    time.sleep(5)
if mode == 'exit_error':
    raise SystemExit(5)
'''


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.root = Path(self.temp.name)
        self.workspace = self.root / 'workspace'
        self.fixture = self.root / 'fake_cli.py'
        self.fixture.write_text(FAKE_CLI, encoding='utf-8')
        self.receipt = self.root / 'receipt.json'
        self.processes = []

    def tearDown(self):
        for proc in self.processes:
            self.assertIsNotNone(proc.poll(), 'Fixture process was not reaped')
            self.assertTrue(all(stream.closed for stream in (proc.stdin, proc.stdout, proc.stderr)))
        self.assertTrue(self.root.resolve().is_relative_to(Path(__file__).resolve().parent))
        self.temp.cleanup()

    def call(self, mode, prompt='Meu pedido', timeout=3, **options):
        popen = subprocess.Popen
        def start(*args, **kwargs):
            proc = popen(*args, **kwargs)
            self.processes.append(proc)
            return proc
        with patch.object(runtime, 'command', return_value=[sys.executable, '-u', str(self.fixture), mode, str(self.receipt)]), patch.object(runtime.subprocess, 'Popen', side_effect=start) as launched:
            result = runtime.ask(self.root, self.workspace, prompt, timeout=timeout, **options)
            return result, launched.call_args

    def test_probe_reads_init_without_prompt(self):
        result, _ = self.call('success', None, _probe=True)
        self.assertEqual(result, {'agent': 'jarvis-chat', 'tools': [], 'verified': True})
        self.assertFalse(self.receipt.exists())

    def test_start_callback_failure_never_sends_prompt(self):
        def rejected():
            raise RuntimeError('START refused')
        with self.assertRaisesRegex(RuntimeError, 'START refused'):
            self.call('success', before_send=rejected)
        self.assertFalse(self.receipt.exists())

    def test_cancellation_interrupts_wait_and_reaps_process(self):
        import threading
        cancel = threading.Event()
        def ready():
            threading.Timer(0.15, cancel.set).start()
        started = time.monotonic()
        with self.assertRaisesRegex(RuntimeError, 'interrompido'):
            self.call('timeout_turn', timeout=3, before_send=ready, cancel_event=cancel)
        self.assertLess(time.monotonic() - started, 2)

    def test_cli_environment_has_no_worker_or_transport_credentials(self):
        with patch.dict(os.environ, {'SUPABASE_URL': 'https://private', 'SUPABASE_ANON_KEY': 'secret',
            'JARVIS_DEVICE_TOKEN': 'secret', 'SUPABASE_ACCESS_TOKEN': 'secret', 'GOOGLE_GEMINI_BASE_URL': 'https://override',
            'HTTPS_PROXY': 'https://proxy', 'GOOGLE_APPLICATION_CREDENTIALS': 'private.json'}):
            env = runtime.cli_environment()
            self.assertFalse(set(('SUPABASE_URL','SUPABASE_ANON_KEY','JARVIS_DEVICE_TOKEN','SUPABASE_ACCESS_TOKEN',
                'GOOGLE_GEMINI_BASE_URL','HTTPS_PROXY','GOOGLE_APPLICATION_CREDENTIALS')) & set(env))

    def test_result_quota_is_classified_without_leaking_vendor_detail(self):
        with self.assertRaisesRegex(RuntimeError, 'cota do Antigravity') as error:
            self.call('quota')
        self.assertNotIn('internal-secret', str(error.exception))

    def test_success_stdin_not_arguments_and_filtered_environment(self):
        prompt = '  Pedido: $(texto) "aspas"\nEficiência  '
        with patch.dict(os.environ, {'GEMINI_API_KEY': 'not-a-real-key', 'GOOGLE_API_KEY': 'not-a-real-key', 'GOOGLE_GENAI_USE_VERTEXAI': 'true'}):
            result, invocation = self.call('success', prompt)
        self.assertEqual(result, 'Olá Henrique')
        args, kwargs = invocation
        self.assertNotIn(prompt, args[0])
        self.assertIn('--disable-slash-commands', args[0])
        self.assertNotIn('--dangerously-skip-permissions', args[0])
        self.assertNotIn('--continue', args[0])
        self.assertFalse(set(('GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_USE_VERTEXAI')) & kwargs['env'].keys())
        lines = self.receipt.read_text(encoding='utf-8').splitlines()
        self.assertEqual(len(lines), 1)
        self.assertEqual(json.loads(lines[0]), {'event': 'user', 'message': {'content': prompt}})

    def test_unverified_init_never_receives_prompt(self):
        for mode in ('unsafe_tools', 'wrong_agent', 'missing_tools', 'wrong_tools_type', 'no_init', 'invalid_init'):
            with self.subTest(mode=mode):
                self.receipt.unlink(missing_ok=True)
                with self.assertRaises(RuntimeError) as error:
                    self.call(mode, 'DADOS-QUE-NAO-PODEM-SER-ENVIADOS')
                if mode == 'unsafe_tools':
                    self.assertIn('anunciou ferramentas', str(error.exception))
                    self.assertIn('bloqueada antes de enviar seu pedido', str(error.exception))
                self.assertNotIn('internal-secret', str(error.exception))
                if self.receipt.exists():
                    self.assertNotIn('DADOS-QUE-NAO-PODEM-SER-ENVIADOS', self.receipt.read_text(encoding='utf-8'))

    def test_auth_error_before_init_is_classified_without_sending_data(self):
        with self.assertRaisesRegex(RuntimeError, 'Entre com sua conta Google') as error:
            self.call('auth_first', 'DADOS-NAO-ENVIADOS')
        self.assertNotIn('internal-secret', str(error.exception))
        self.assertFalse(self.receipt.exists())

    @unittest.skipUnless(os.name == 'nt', 'Windows Job Object cleanup')
    def test_windows_cleanup_also_terminates_child_process(self):
        import ctypes
        from ctypes import wintypes
        with self.assertRaisesRegex(RuntimeError, 'bloqueada antes de enviar seu pedido'):
            self.call('unsafe_child')
        child_pid = int(self.receipt.read_text(encoding='utf-8'))
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.WaitForSingleObject.restype = wintypes.DWORD
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.OpenProcess(0x100000, False, child_pid)  # SYNCHRONIZE
        if handle:
            try:
                self.assertEqual(kernel.WaitForSingleObject(handle, 2000), 0)
            finally:
                kernel.CloseHandle(handle)

    def test_invalid_or_failed_results_and_exit_are_not_success(self):
        for mode in ('invalid_result', 'failed', 'empty', 'missing_status', 'missing_result', 'exit_error', 'duplicate_result'):
            with self.subTest(mode=mode), self.assertRaises(RuntimeError) as error:
                self.call(mode)
            self.assertNotIn('internal-secret', str(error.exception))

    def test_shared_deadline_for_init_turn_blocked_stdin_and_exit(self):
        for mode in ('timeout_init', 'timeout_turn', 'timeout_writer', 'timeout_exit'):
            with self.subTest(mode=mode):
                started = time.monotonic()
                with self.assertRaisesRegex(RuntimeError, 'tempo limite'):
                    self.call(mode, 'x' * runtime.MAX_PROMPT_CHARS, timeout=0.35)
                self.assertLess(time.monotonic() - started, 2.5)

    def test_stderr_is_drained_and_never_leaked(self):
        result, _ = self.call('stderr')
        self.assertEqual(result, 'Olá Henrique')
        with self.assertRaisesRegex(RuntimeError, 'limite seguro') as error:
            self.call('overflow')
        self.assertNotIn('internal-secret', str(error.exception))

    def test_profile_is_local_and_disallows_tools_and_execution(self):
        profile = runtime.prepare_workspace(self.workspace)
        self.assertEqual(profile, self.workspace.resolve() / '.agents/agents/jarvis-chat/agent.md')
        content = profile.read_text(encoding='utf-8')
        for field in ('tools: []', 'mainAgent: true', 'subagent: false', 'commandExecutionPolicy: "off"', 'mcpServers: []', 'skills: []', 'plugins: []'):
            self.assertIn(field, content)
        self.assertFalse((self.root / '.gemini').exists())

    def test_command_prefers_local_then_path_then_user_install(self):
        local = self.root / '.tools/antigravity/agy.exe'
        local.parent.mkdir(parents=True)
        local.write_bytes(b'fixture')
        with patch.object(runtime.shutil, 'which', return_value='from-path'):
            self.assertEqual(runtime.command(self.root), [str(local.resolve())])
        local.unlink()
        with patch.object(runtime.shutil, 'which', return_value='from-path'):
            self.assertEqual(runtime.command(self.root), ['from-path'])
        user_install = self.root / 'local-data/agy/bin/agy.exe'
        user_install.parent.mkdir(parents=True)
        user_install.write_bytes(b'fixture')
        with patch.object(runtime.shutil, 'which', return_value=None), patch.dict(os.environ, {'LOCALAPPDATA': str(self.root / 'local-data')}):
            self.assertTrue(runtime.available(self.root))
            self.assertEqual(runtime.command(self.root), [str(user_install.resolve())])
            user_install.unlink()
            self.assertFalse(runtime.available(self.root))

    def test_input_validation_does_not_launch_process(self):
        with patch.object(runtime.subprocess, 'Popen') as launched:
            for prompt in ('', ' ', 'x' * (runtime.MAX_PROMPT_CHARS + 1), None):
                with self.subTest(prompt_length=len(prompt) if isinstance(prompt, str) else None), self.assertRaises(ValueError):
                    runtime.ask(self.root, self.workspace, prompt)
            with self.assertRaises(ValueError):
                runtime.ask(self.root, self.workspace, 'Olá', timeout=0)
            launched.assert_not_called()

    def test_job_creation_failure_does_not_start_cli(self):
        with patch.object(runtime, 'command', return_value=[sys.executable]), patch.object(runtime, '_ProcessGroup', side_effect=RuntimeError('process protection failed')), patch.object(runtime.subprocess, 'Popen') as launched:
            with self.assertRaisesRegex(RuntimeError, 'process protection failed'):
                runtime.ask(self.root, self.workspace, 'DADOS-NAO-ENVIADOS')
            launched.assert_not_called()

    @unittest.skipUnless(os.name == 'nt', 'Windows process association')
    def test_job_assignment_failure_reaps_suspended_process_without_prompt(self):
        with patch.object(runtime._ProcessGroup, 'attach', side_effect=RuntimeError('process protection failed')):
            with self.assertRaisesRegex(RuntimeError, 'process protection failed'):
                self.call('success', 'DADOS-NAO-ENVIADOS')
        self.assertFalse(self.receipt.exists())


if __name__ == '__main__':
    unittest.main()
