"""Outbound-only Windows worker. No jobs run before the strict CLI init gate.

Sessions, device credentials and the result outbox are Windows-user DPAPI data.
No HTTP listener, service-role key, automatic login or background task is created.
"""
import argparse
import base64
from contextlib import nullcontext
import ctypes
import getpass
import hashlib
import json
import os
from pathlib import Path
import signal
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import antigravity_runtime as runtime

ORIGIN = 'https://jarvis-ten-pi-14.vercel.app'
POLL_SECONDS = 10
HEARTBEAT_SECONDS = 30
MAX_RESPONSE_BYTES = 512000
FAIL_CODES = {'execution_failed', 'result_uncertain', 'timeout', 'policy_blocked', 'auth_required', 'quota_exceeded'}


class WorkerError(RuntimeError):
    def __init__(self, code, message, status=None):
        super().__init__(message)
        self.code = code
        self.status = status


def identifier(value):
    try:
        if not isinstance(value, str) or str(uuid.UUID(value)) != value.lower():
            raise ValueError
    except (ValueError, AttributeError):
        raise WorkerError('execution_failed', 'A fila retornou um identificador inválido.') from None
    return value


def dpapi(data, decrypt=False):
    if os.name != 'nt':
        raise WorkerError('execution_failed', 'As credenciais do worker requerem Windows DPAPI.')
    from ctypes import wintypes
    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]
    crypt = ctypes.WinDLL('crypt32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    crypt.CryptProtectData.argtypes = [ctypes.POINTER(Blob), wintypes.LPCWSTR, ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    crypt.CryptProtectData.restype = wintypes.BOOL
    crypt.CryptUnprotectData.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    crypt.CryptUnprotectData.restype = wintypes.BOOL
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    raw = ctypes.create_string_buffer(data)
    entropy = ctypes.create_string_buffer(b'Jarvis Windows Worker v1')
    source = Blob(len(data), ctypes.cast(raw, ctypes.POINTER(ctypes.c_ubyte)))
    extra = Blob(len(entropy.raw), ctypes.cast(entropy, ctypes.POINTER(ctypes.c_ubyte)))
    result = Blob()
    args = (ctypes.byref(source), None, ctypes.byref(extra), None, None, 1, ctypes.byref(result))
    success = (crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData)(*args)
    if not success:
        raise WorkerError('execution_failed', 'Não foi possível proteger ou abrir os dados deste usuário Windows.')
    try:
        return ctypes.string_at(result.data, result.size)
    finally:
        kernel.LocalFree(result.data)


class Vault:
    def __init__(self, root, protector=dpapi):
        self.root = Path(root).absolute()
        self.protector = protector
        self.lock = threading.RLock()

    def path(self, name):
        if name not in ('credentials', 'outbox', 'preferences'):
            raise WorkerError('execution_failed', 'Arquivo protegido inválido.')
        target = self.root / (name + '.dpapi')
        # Check every existing parent before touching disk, including junctions.
        for item in (target, *target.parents):
            if item.is_symlink() or (hasattr(item, 'is_junction') and item.is_junction()):
                raise WorkerError('execution_failed', 'A pasta protegida não pode usar links ou junctions.')
        return target

    def read(self, name):
        with self.lock:
            path = self.path(name)
            if not path.exists():
                return None
            raw = path.read_bytes()
            if len(raw) > MAX_RESPONSE_BYTES:
                raise WorkerError('execution_failed', 'Arquivo protegido excede o limite seguro.')
            try:
                value = json.loads(self.protector(raw, decrypt=True).decode('utf-8'))
            except (ValueError, UnicodeError):
                raise WorkerError('execution_failed', 'Arquivo protegido inválido.') from None
            if not isinstance(value, dict):
                raise WorkerError('execution_failed', 'Arquivo protegido inválido.')
            return value

    def write(self, name, value):
        with self.lock:
            path = self.path(name)
            encrypted = self.protector(json.dumps(value, ensure_ascii=False).encode('utf-8'))
            if len(encrypted) > MAX_RESPONSE_BYTES:
                raise WorkerError('execution_failed', 'Arquivo protegido excede o limite seguro.')
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
            try:
                with temporary.open('xb') as output:
                    output.write(encrypted)
                    output.flush()
                    os.fsync(output.fileno())
                temporary.replace(path)
            finally:
                temporary.unlink(missing_ok=True)

    def remove(self, name):
        with self.lock:
            self.path(name).unlink(missing_ok=True)


class SingleInstance:
    def __init__(self):
        self.handle = None

    def __enter__(self):
        if os.name != 'nt':
            raise WorkerError('execution_failed', 'O worker requer Windows.')
        from ctypes import wintypes
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.kernel.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
        self.kernel.CreateMutexW.restype = wintypes.HANDLE
        self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        self.kernel.ReleaseMutex.argtypes = [wintypes.HANDLE]
        name = 'Global\\JarvisWorker-' + hashlib.sha256(str(Path.home()).encode()).hexdigest()[:24]
        ctypes.set_last_error(0)
        self.handle = self.kernel.CreateMutexW(None, True, name)
        if not self.handle or ctypes.get_last_error() == 183:
            if self.handle:
                self.kernel.CloseHandle(self.handle)
                self.handle = None
            raise WorkerError('execution_failed', 'Já existe um worker ou configuração em execução para este usuário.')
        return self

    def __exit__(self, *_):
        if self.handle:
            self.kernel.ReleaseMutex(self.handle)
            self.kernel.CloseHandle(self.handle)
            self.handle = None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_):
        return None


def request_json(url, payload=None, headers=None):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise WorkerError('connection_error', 'Endpoint HTTPS inválido.')
    raw = None if payload is None else json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(url, data=raw, headers={'Content-Type': 'application/json', **(headers or {})})
    try:
        # Explicitly ignore inherited proxies; never forward tokens on redirects.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        with opener.open(request, timeout=12) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise WorkerError('connection_error', 'A resposta online excedeu o limite seguro.')
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
        code = 'auth_required' if status == 401 else 'device_revoked' if status == 403 else 'quota_exceeded' if status == 429 else 'connection_error'
        raise WorkerError(code, 'O servidor recusou a operação do worker. Verifique sessão, dispositivo e disponibilidade.', status) from None
    except (urllib.error.URLError, OSError):
        raise WorkerError('connection_error', 'Não foi possível conectar ao Jarvis online.') from None
    try:
        result = json.loads(raw.decode('utf-8'))
    except (ValueError, UnicodeError):
        raise WorkerError('connection_error', 'O servidor retornou dados inválidos.') from None
    if not isinstance(result, dict):
        raise WorkerError('connection_error', 'O servidor retornou dados inválidos.')
    return result


class Client:
    def __init__(self, vault, requester=request_json):
        self.vault = vault
        self.requester = requester
        self.lock = threading.RLock()
        self.credentials = vault.read('credentials')
        if not self.credentials:
            raise WorkerError('auth_required', 'Execute CONFIGURAR-WORKER.bat para conectar sua conta.')
        if self.credentials.get('origin') != ORIGIN:
            raise WorkerError('connection_error', 'A configuração não pertence ao Jarvis online autorizado.')

    def token(self):
        with self.lock:
            if self.credentials.get('expiresAt', 0) < time.time() + 60:
                url = self.credentials['supabaseUrl']
                validate_supabase(url)
                session = self.requester(url + '/auth/v1/token?grant_type=refresh_token',
                    {'refresh_token': self.credentials['refreshToken']}, {'apikey': self.credentials['publicKey']})
                store_session(self.credentials, session)
                if not self.vault.path('credentials').exists():
                    raise WorkerError('device_revoked', 'A configuração local foi desconectada.', 403)
                self.vault.write('credentials', self.credentials)
            return self.credentials['accessToken']

    def api(self, name, values):
        if name not in ('worker-heartbeat', 'worker-claim', 'worker-start', 'worker-renew', 'worker-complete', 'worker-fail', 'worker-revoke'):
            raise WorkerError('execution_failed', 'Operação do worker inválida.')
        return self.requester(ORIGIN + '/api/' + name, {'deviceId': self.credentials['deviceId'], **values},
            {'Authorization': 'Bearer ' + self.token(), 'X-Jarvis-Device-Token': self.credentials['deviceToken']})


def validate_supabase(value):
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme != 'https' or not parsed.hostname or not parsed.hostname.endswith('.supabase.co') or parsed.path not in ('', '/') or parsed.port or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise WorkerError('connection_error', 'URL pública do Supabase inválida.')


def store_session(credentials, session):
    if not isinstance(session.get('access_token'), str) or not isinstance(session.get('refresh_token'), str) or not isinstance(session.get('expires_in'), (int, float)) or session['expires_in'] <= 0:
        raise WorkerError('auth_required', 'A sessão Supabase não foi confirmada.')
    credentials.update(accessToken=session['access_token'], refreshToken=session['refresh_token'], expiresAt=time.time() + session['expires_in'])


def public_key(value):
    if isinstance(value, str) and value.startswith('sb_publishable_'):
        return value
    try:
        if isinstance(value, str) and len(value.split('.')) == 3:
            part = value.split('.')[1]
            if json.loads(base64.urlsafe_b64decode(part + '=' * (-len(part) % 4)))['role'] == 'anon':
                return value
    except (ValueError, KeyError):
        pass
    raise WorkerError('connection_error', 'O worker requer a chave pública do Supabase, nunca service_role ou secret key.')


def runs_directory(vault):
    vault.path('outbox')
    runs = vault.root / 'runs'
    if runs.is_symlink() or (hasattr(runs, 'is_junction') and runs.is_junction()):
        raise WorkerError('execution_failed', 'Workspace do worker redirecionado.')
    runs.mkdir(parents=True, exist_ok=True)
    return runs


def startup_check(root, vault, client, engine=runtime):
    """Proof before task installation: no model prompt and no job is claimed."""
    if vault.read('outbox') or (vault.read('preferences') or {}).get('paused'):
        raise WorkerError('policy_blocked', 'Resolva a conclusão pendente e a pausa antes de instalar a inicialização.')
    with tempfile.TemporaryDirectory(prefix='startup-probe-', dir=runs_directory(vault)) as workspace:
        proof = engine.probe(root, workspace, timeout=25)
        if proof.get('agent') != runtime.AGENT_NAME or proof.get('tools') != [] or proof.get('verified') is not True:
            raise WorkerError('policy_blocked', 'O agente não confirmou ferramentas vazias. Inicialização bloqueada.')
    client.api('worker-heartbeat', {'status': 'ready', 'reason': 'none'})
    online = client.requester(ORIGIN + '/api/ai-check', {}, {'Authorization': 'Bearer ' + client.token()})
    if online.get('provider') != 'antigravity_windows' or online.get('ok') is not True or online.get('worker', {}).get('status') != 'ready':
        raise WorkerError('policy_blocked', 'O gate online não confirmou disponibilidade. Nenhuma tarefa pode ser instalada.')
    return True


def setup(vault, requester=request_json):
    if vault.read('outbox'):
        raise WorkerError('result_uncertain', 'Existe um resultado pendente. Recupere-o antes de trocar o dispositivo.')
    config = requester(ORIGIN + '/api/config')
    if config.get('configured') is not True:
        raise WorkerError('connection_error', 'O Jarvis online ainda não está configurado.')
    url = config.get('supabaseUrl', '')
    validate_supabase(url)
    key = public_key(config.get('supabaseAnonKey'))
    email = input('Email confirmado da sua conta Jarvis: ').strip()
    password = getpass.getpass('Senha Supabase (não será exibida nem salva): ')
    try:
        session = requester(url + '/auth/v1/token?grant_type=password', {'email': email, 'password': password}, {'apikey': key})
    finally:
        password = None
    credentials = {'origin': ORIGIN, 'supabaseUrl': url, 'publicKey': key}
    store_session(credentials, session)
    device = requester(ORIGIN + '/api/worker-register', {}, {'Authorization': 'Bearer ' + credentials['accessToken']})
    identifier(device.get('deviceId'))
    try:
        token = device['deviceToken']
        raw = base64.urlsafe_b64decode(token + '=')
        valid = isinstance(token, str) and len(token) == 43 and len(raw) == 32 and base64.urlsafe_b64encode(raw).decode().rstrip('=') == token
    except (ValueError, KeyError, TypeError):
        valid = False
    if not valid:
        raise WorkerError('connection_error', 'O dispositivo não foi confirmado pelo servidor.')
    credentials.update(deviceId=device['deviceId'], deviceToken=device['deviceToken'])
    vault.write('credentials', credentials)
    print('Conta e dispositivo protegidos pelo Windows. Nenhum login Google foi copiado.')
    print('O worker só iniciará pedidos após verificar o agente sem ferramentas e o gate online.')


class Worker:
    def __init__(self, app_root, vault, client, engine=runtime, stop=None):
        self.app_root = Path(app_root)
        self.vault = vault
        self.client = client
        self.engine = engine
        self.stop = stop or threading.Event()
        self.status = 'blocked'
        self.reason = 'policy_unverified'

    def heartbeat(self):
        return self.client.api('worker-heartbeat', {'status': self.status, 'reason': self.reason})

    def recover(self):
        record = self.vault.read('outbox')
        if not record:
            return True
        if record.get('deviceId') != self.client.credentials['deviceId']:
            raise WorkerError('result_uncertain', 'O resultado pendente pertence a outro dispositivo. Não gere o pedido novamente.')
        values = {'jobId': identifier(record['jobId']), 'attemptId': identifier(record['attemptId'])}
        if record.get('stage') == 'terminal':
            raise WorkerError('result_uncertain', 'A tentativa terminou ou perdeu a autorização. Resultado protegido para revisão; nenhuma nova geração será iniciada.')
        try:
            if record.get('stage') == 'answered':
                answer = record.get('answer')
                if not isinstance(answer, str) or not answer.strip() or len(answer) > 32000:
                    raise WorkerError('result_uncertain', 'Resultado pendente inválido. Nenhum pedido será regenerado.')
                result = self.client.api('worker-complete', {**values, 'answer': answer})
                expected = 'completed'
            else:
                code = record.get('code') if record.get('stage') == 'failed' else 'result_uncertain'
                if code not in FAIL_CODES:
                    code = 'result_uncertain'
                result = self.client.api('worker-fail', {**values, 'code': code})
                expected = 'failed'
            if result.get('jobId') != values['jobId'] or result.get('status') != expected:
                raise WorkerError('connection_error', 'A conclusão não foi confirmada. O resultado permanece protegido.')
        except WorkerError as error:
            if error.status in (400, 403, 404, 409, 413):
                record.update(stage='terminal', code='result_uncertain')
                self.vault.write('outbox', record)
                raise WorkerError('result_uncertain', 'O servidor recusou esta tentativa. Resultado protegido para revisão; não será regenerado.', error.status) from None
            raise
        self.vault.remove('outbox')
        return True

    def execute(self, job):
        values = {'jobId': identifier(job.get('jobId')), 'attemptId': identifier(job.get('attemptId'))}
        prompt = job.get('prompt')
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 32000:
            raise WorkerError('execution_failed', 'Contexto da fila inválido.')
        record = {**values, 'deviceId': self.client.credentials['deviceId'], 'stage': 'claimed'}
        self.vault.write('outbox', record)
        cancel = threading.Event()
        finished = threading.Event()
        started = False
        self.status, self.reason = 'processing', 'busy'

        def before_send():
            nonlocal started
            if self.stop.is_set() or cancel.is_set():
                raise WorkerError('cancelled', 'Pedido cancelado antes da geração.')
            record['stage'] = 'start_pending'
            self.vault.write('outbox', record)
            result = self.client.api('worker-start', values)
            if result.get('started') is not True or result.get('alreadyStarted') is not False:
                raise WorkerError('result_uncertain', 'O início não foi confirmado como uma nova geração. Não será repetido.')
            started = True
            record['stage'] = 'started'
            self.vault.write('outbox', record)

        def renew():
            renew_at = time.monotonic() + HEARTBEAT_SECONDS
            preferences_at = 0
            while not finished.wait(0.2):
                if self.stop.is_set():
                    cancel.set()
                    return
                try:
                    if time.monotonic() >= preferences_at:
                        if (self.vault.read('preferences') or {}).get('paused'):
                            cancel.set()
                            return
                        preferences_at = time.monotonic() + 1
                    if time.monotonic() < renew_at:
                        continue
                    result = self.client.api('worker-renew', values)
                    if result.get('cancelled') is True or result.get('status') in ('cancelled', 'expired', 'failed') or result.get('renewed') is not True:
                        cancel.set()
                        return
                    self.heartbeat()
                    renew_at = time.monotonic() + HEARTBEAT_SECONDS
                except (WorkerError, OSError):
                    # A lost lease must stop the local generation immediately.
                    cancel.set()
                    return

        monitor = threading.Thread(target=renew, daemon=True)
        monitor.start()
        workspace = None
        try:
            workspace = Path(tempfile.mkdtemp(prefix='job-', dir=runs_directory(self.vault)))
            answer = self.engine.ask(self.app_root, workspace, prompt, timeout=180, before_send=before_send, cancel_event=cancel)
            if not started or self.stop.is_set() or cancel.is_set():
                raise WorkerError('result_uncertain', 'A geração não tem uma conclusão segura.')
            if not isinstance(answer, str) or not answer.strip() or len(answer) > 32000:
                raise WorkerError('execution_failed', 'A resposta não tem formato de texto válido.')
            record.update(stage='answered', answer=answer)
            self.vault.write('outbox', record)
            self.recover()
        except Exception as error:
            if record.get('stage') == 'answered':
                # Only completion is retried. Never launch the model for this job again.
                raise WorkerError('connection_error', 'Resultado protegido; a conclusão online será tentada novamente.') from None
            code = ('policy_blocked' if isinstance(error, runtime.PolicyBlockedError)
                    else error.code if isinstance(error, WorkerError) and error.code in FAIL_CODES
                    else 'auth_required' if 'conta Google' in str(error)
                    else 'quota_exceeded' if 'cota do Antigravity foi atingida' in str(error)
                    else 'timeout' if 'tempo limite' in str(error)
                    else 'result_uncertain' if started or record.get('stage') == 'start_pending'
                    else 'execution_failed')
            record.update(stage='failed', code=code)
            self.vault.write('outbox', record)
            self.recover()
            if code in ('policy_blocked', 'auth_required', 'quota_exceeded'):
                self.status = 'blocked' if code == 'policy_blocked' else 'error'
                self.reason = {'policy_blocked': 'policy_unverified', 'auth_required': 'login_required', 'quota_exceeded': 'quota_exceeded'}[code]
                self.heartbeat()
                raise WorkerError(code, 'O worker foi interrompido por política, login ou cota. Nenhum outro pedido será buscado.')
        finally:
            finished.set()
            cancel.set()
            monitor.join(timeout=13)
            if workspace is not None:
                # CLI may keep global transcripts; this removes only our scratch profile.
                import shutil
                shutil.rmtree(workspace)
            if self.status == 'processing':
                self.status, self.reason = 'ready', 'none'

    def run(self):
        self.recover()
        preferences = self.vault.read('preferences') or {}
        if preferences.get('paused'):
            self.status, self.reason = 'paused', 'none'
            self.heartbeat()
            return
        with tempfile.TemporaryDirectory(prefix='probe-', dir=runs_directory(self.vault)) as workspace:
            try:
                proof = self.engine.probe(self.app_root, workspace, timeout=25)
                if proof.get('verified') is not True or proof.get('tools') != [] or proof.get('agent') != runtime.AGENT_NAME:
                    raise runtime.PolicyBlockedError('O CLI não confirmou o contrato sem ferramentas.')
            except runtime.PolicyBlockedError:
                self.status, self.reason = 'blocked', 'policy_unverified'
                self.heartbeat()
                raise WorkerError('policy_blocked', 'O CLI anunciou ferramentas. Worker bloqueado antes de buscar pedidos.') from None
            except RuntimeError as error:
                self.status = 'error'
                self.reason = 'login_required' if 'conta Google' in str(error) else 'cli_missing' if 'não encontrado' in str(error) else 'runtime_error'
                self.heartbeat()
                raise WorkerError('execution_failed', 'A verificação do CLI falhou. Nenhum pedido foi buscado.') from None
        self.status, self.reason = 'ready', 'none'
        heartbeat_at = 0
        while not self.stop.is_set():
            try:
                preferences = self.vault.read('preferences') or {}
                if preferences.get('paused'):
                    self.status, self.reason = 'paused', 'none'
                    self.heartbeat()
                    return
                self.recover()
                if time.monotonic() >= heartbeat_at:
                    self.heartbeat()
                    heartbeat_at = time.monotonic() + HEARTBEAT_SECONDS
                job = self.client.api('worker-claim', {})
                if job.get('job') is not None or job.get('jobId'):
                    self.execute(job)
            except WorkerError as error:
                if error.code in ('policy_blocked', 'quota_exceeded'):
                    raise
                self.status = 'error'
                self.reason = 'revoked' if error.code == 'device_revoked' else 'login_required' if error.code == 'auth_required' else 'quota_exceeded' if error.code == 'quota_exceeded' else 'connection_error'
                if error.status in (400, 401, 403, 404, 409, 413) or error.code == 'result_uncertain':
                    raise
                # Outbox blocks the next claim until completion/failure succeeds.
            self.stop.wait(POLL_SECONDS)
        self.status, self.reason = 'offline', 'offline'
        try:
            self.heartbeat()
        except WorkerError:
            pass


def main():
    parser = argparse.ArgumentParser(description='Worker Windows Jarvis — somente conexões HTTPS de saída.')
    parser.add_argument('action', choices=('run', 'setup', 'pause', 'resume', 'disconnect', 'status', 'probe', 'startup-check'), nargs='?', default='run')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    data = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local'))) / 'JarvisGemini' / 'worker'
    vault = Vault(data)
    stop = threading.Event()
    for name in ('SIGINT', 'SIGTERM'):
        signal.signal(getattr(signal, name), lambda *_: stop.set())
    try:
        # Pause/status/revoke must remain usable while the single run is active.
        with SingleInstance() if args.action in ('run', 'setup', 'probe', 'startup-check') else nullcontext():
            if args.action == 'setup':
                # Verify DPAPI first, before the user enters any credential.
                dpapi(b'check')
                setup(vault)
            elif args.action == 'probe':
                with tempfile.TemporaryDirectory(prefix='probe-', dir=runs_directory(vault)) as workspace:
                    print(runtime.probe(root, workspace, timeout=25))
            elif args.action == 'startup-check':
                startup_check(root, vault, Client(vault))
                print('Contrato sem ferramentas e gate online confirmados. Nenhum pedido foi buscado ou enviado.')
            elif args.action in ('pause', 'resume'):
                vault.write('preferences', {'paused': args.action == 'pause'})
                print('Preferência salva. Use INICIAR-WORKER para retomar após a verificação de segurança.')
            elif args.action == 'status':
                print('Configurado:', bool(vault.read('credentials')))
                print('Pausado:', bool((vault.read('preferences') or {}).get('paused')))
                print('Conclusão pendente:', bool(vault.read('outbox')))
                print('Ferramentas e login só são confirmados pelo probe; configuração não equivale a disponibilidade.')
            elif args.action == 'disconnect':
                vault.write('preferences', {'paused': True})
                result = Client(vault).api('worker-revoke', {})
                if result.get('revoked') is not True:
                    raise WorkerError('connection_error', 'A revogação não foi confirmada. Credenciais preservadas para tentar novamente.')
                vault.remove('credentials')
                vault.write('preferences', {'paused': True})
                print('Dispositivo revogado. Credenciais locais removidas; resultados pendentes continuam protegidos.')
            else:
                print('Verificando CLI antes de buscar pedidos. Credenciais e conteúdo nunca serão exibidos.')
                Worker(root, vault, Client(vault), stop=stop).run()
        return 0
    except (WorkerError, RuntimeError, OSError) as error:
        # Exception messages from urllib/JSON/DPAPI never reach stdout.
        if isinstance(error, (WorkerError, runtime.PolicyBlockedError)):
            print(str(error))
        else:
            print('Worker indisponível. Verifique instalação, conta e conexão pelo menu de configuração.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
