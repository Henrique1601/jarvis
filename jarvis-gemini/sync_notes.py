"""Voluntary synchronization of explicitly selected online notes; never scans the vault."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import uuid

from worker import Client, Vault, WorkerError, ORIGIN

MAX_CHARS = 200000
MAX_BYTES = MAX_CHARS * 4


class SyncError(RuntimeError):
    pass


def note_id(value):
    try:
        if str(uuid.UUID(value)) != value.lower():
            raise ValueError
    except (ValueError, AttributeError, TypeError):
        raise SyncError('Identificador de nota inválido.') from None
    return value.lower()


def digest(content):
    return hashlib.sha256(content.encode('utf-8')).hexdigest()


def validate_note(value, ident):
    if not isinstance(value, dict) or value.get('id') != ident:
        raise SyncError('O servidor retornou uma nota inválida.')
    content = value.get('content')
    revision = value.get('revision')
    # Server revision includes metadata (folder/tags) and is opaque to this tool.
    if not isinstance(content, str) or len(content) > MAX_CHARS or not isinstance(revision, str) or not re.fullmatch(r'[a-f0-9]{64}', revision):
        raise SyncError('Conteúdo ou revisão da nota inválidos.')
    return value


class OnlineNotes:
    def __init__(self, client):
        self.client = client

    def __call__(self, endpoint, values):
        if endpoint not in ('note-read', 'note-update'):
            raise SyncError('Operação inválida.')
        # worker.request_json uses ASCII-escaped JSON; check its actual transport
        # size before transmission (server also enforces this independently).
        if len(json.dumps(values).encode('utf-8')) > 250000:
            raise SyncError('O envio excede 250 KB de JSON. Divida a nota; o arquivo local foi preservado.')
        # The sync tool never refreshes a session concurrently with the worker.
        # Reload its latest DPAPI session; token expiry asks for a worker refresh.
        import time
        session = self.client.vault.read('credentials')
        if not session or session.get('origin') != ORIGIN or session.get('expiresAt', 0) < time.time() + 30:
            raise SyncError('Sessão indisponível. Deixe o worker renovar a sessão ou reconecte em CONFIGURAR-WORKER.bat.')
        return self.client.requester(ORIGIN + '/api/' + endpoint, values,
                                     {'Authorization': 'Bearer ' + session['accessToken']})


class NoteSync:
    def __init__(self, root, remote):
        self.root = Path(root).absolute()
        self.remote = remote
        self.path('manifest.json')  # reject redirected parent before mkdir
        self.root.mkdir(parents=True, exist_ok=True)
        self.manifest = {'version': 1, 'notes': {}}
        target = self.path('manifest.json')
        if target.exists():
            if target.stat().st_size > MAX_BYTES:
                raise SyncError('Manifesto excede o limite.')
            try:
                self.manifest = json.loads(target.read_text(encoding='utf-8'))
                if self.manifest.get('version') != 1 or not isinstance(self.manifest.get('notes'), dict):
                    raise ValueError
                for ident, entry in self.manifest['notes'].items():
                    note_id(ident)
                    if not isinstance(entry, dict) or not re.fullmatch(r'[a-f0-9]{64}', entry.get('revision', '')) or not re.fullmatch(r'[a-f0-9]{64}', entry.get('hash', '')):
                        raise ValueError
            except (ValueError, TypeError, AttributeError):
                raise SyncError('Manifesto inválido. Preserve os arquivos antes de reconfigurar.') from None

    def path(self, name):
        parts = Path(name)
        if parts.is_absolute() or '..' in parts.parts or ':' in str(parts):
            raise SyncError('Caminho de sincronização inválido.')
        result = self.root / parts
        for parent in (result, *result.parents):
            if parent.is_symlink() or (hasattr(parent, 'is_junction') and parent.is_junction()):
                raise SyncError('Links e junctions não são permitidos na sincronização.')
        if not result.is_relative_to(self.root):
            raise SyncError('Caminho fora da pasta dedicada.')
        return result

    def atomic(self, name, content):
        target = self.path(name)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary_name = name + '.' + uuid.uuid4().hex + '.tmp'
        temporary = self.path(temporary_name)
        try:
            with temporary.open('x', encoding='utf-8', newline='') as output:
                output.write(content)
                output.flush()
                os.fsync(output.fileno())
            self.path(name)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)

    def save(self):
        self.atomic('manifest.json', json.dumps(self.manifest, ensure_ascii=False, indent=2))

    def local(self, ident):
        target = self.path(ident + '.md')
        if not target.exists():
            raise SyncError('Arquivo local ausente. Nenhuma exclusão online foi realizada.')
        if target.stat().st_size > MAX_BYTES:
            raise SyncError('Nota local excede o limite.')
        try:
            content = target.read_bytes().decode('utf-8')
        except UnicodeError:
            raise SyncError('A nota local precisa usar UTF-8.') from None
        if len(content) > MAX_CHARS:
            raise SyncError('Nota local excede 200 mil caracteres.')
        return content

    def backup(self, ident, content):
        self.atomic('backups/' + ident + '.' + uuid.uuid4().hex + '.md', content)

    def baseline(self, ident, cloud):
        self.manifest['notes'][ident] = {'revision': cloud['revision'], 'hash': digest(cloud['content']),
                                         'title': str(cloud.get('title', ''))[:160]}
        self.save()

    def select(self, ident):
        ident = note_id(ident)
        if ident in self.manifest['notes']:
            return 'already_selected'
        cloud = validate_note(self.remote('note-read', {'id': ident}), ident)
        if self.path(ident + '.md').exists():
            raise SyncError('Já existe um arquivo local. Preserve-o ou escolha outro identificador.')
        self.atomic(ident + '.md', cloud['content'])
        self.baseline(ident, cloud)
        return 'selected'

    def remove(self, ident):
        ident = note_id(ident)
        self.manifest['notes'].pop(ident, None)
        self.save()

    def sync(self, ident, pull=False, resolve=None, expected_revision=None):
        ident = note_id(ident)
        baseline = self.manifest['notes'].get(ident)
        if not baseline:
            raise SyncError('Selecione explicitamente esta nota antes de sincronizar.')
        local = self.local(ident)
        cloud = validate_note(self.remote('note-read', {'id': ident}), ident)
        changed_local = digest(local) != baseline['hash']
        changed_cloud = cloud['revision'] != baseline['revision']
        if resolve:
            if resolve not in ('local', 'cloud') or expected_revision != cloud['revision']:
                raise SyncError('A revisão online mudou. Consulte o conflito e confirme a revisão atual.')
        if local == cloud['content']:
            self.baseline(ident, cloud)
            return 'unchanged'
        if changed_local and changed_cloud and not resolve:
            previous_conflict = self.path(ident + '.cloud.md')
            if previous_conflict.exists():
                if previous_conflict.stat().st_size > MAX_BYTES:
                    raise SyncError('Arquivo de conflito excede o limite.')
                self.backup(ident, previous_conflict.read_text(encoding='utf-8'))
            self.atomic(ident + '.cloud.md', cloud['content'])
            # Only metadata is printed: never the contents of either version.
            self.manifest['notes'][ident]['conflictRevision'] = cloud['revision']
            self.save()
            return 'conflict'
        if resolve == 'cloud' or (changed_cloud and not changed_local):
            self.backup(ident, local)
            if self.local(ident) != local:
                raise SyncError('A nota local mudou durante a operação. Tente novamente.')
            self.atomic(ident + '.md', cloud['content'])
            self.baseline(ident, cloud)
            return 'downloaded'
        if resolve == 'local' or changed_local:
            if pull:
                return 'local_changed'
            self.backup(ident, local)
            try:
                updated = validate_note(self.remote('note-update', {'id': ident, 'revision': cloud['revision'], 'content': local}), ident)
            except WorkerError as error:
                if error.status == 409:
                    raise SyncError('Conflito online durante o envio. Arquivo local preservado; execute novamente.') from None
                raise
            self.baseline(ident, updated)
            return 'uploaded'
        return 'unchanged'


def menu():
    """Inputs become validated function arguments, never shell commands."""
    data = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local'))) / 'JarvisGemini'
    print('Notas escolhidas: sincronização manual. Nenhum cofre é lido.')
    print('1 Listar notas online e selecionadas\n2 Selecionar e baixar\n3 Sincronizar uma nota\n4 Só baixar alterações online\n5 Remover seleção\n6 Resolver conflito\n0 Sair')
    choice = input('Escolha: ').strip()
    if choice == '0':
        return 0
    if choice == '1':
        # List online IDs without printing note bodies or credentials.
        client = Client(Vault(data / 'worker'))
        import time
        if client.credentials.get('expiresAt', 0) < time.time() + 30:
            raise SyncError('Sessão vencida. Deixe o worker renovar ou reconecte sua conta.')
        state = client.requester(ORIGIN + '/api/state', headers={'Authorization': 'Bearer ' + client.credentials['accessToken']})
        for note in state.get('notes', []):
            print(note_id(note['id']), str(note.get('title', ''))[:160])
        return main(['--list'])
    flags = {'2': '--select', '3': '--sync', '4': '--pull', '5': '--remove'}
    ident = note_id(input('UUID da nota: ').strip())
    if choice == '6':
        source = input('Versão que deseja manter (cloud ou local): ').strip()
        revision = input('Revisão online do conflito exibida em --list: ').strip()
        return main(['--resolve', source, '--note', ident, '--revision', revision])
    if choice not in flags:
        raise SyncError('Opção inválida.')
    return main([flags[choice], ident])


def main(argv=None):
    parser = argparse.ArgumentParser(description='Sincronização voluntária de notas escolhidas. Não lê o cofre local.')
    commands = parser.add_mutually_exclusive_group(required=True)
    commands.add_argument('--list', action='store_true')
    commands.add_argument('--select', metavar='UUID')
    commands.add_argument('--remove', metavar='UUID')
    commands.add_argument('--pull', metavar='UUID')
    commands.add_argument('--sync', metavar='UUID')
    commands.add_argument('--resolve', choices=('cloud', 'local'))
    commands.add_argument('--menu', action='store_true')
    parser.add_argument('--note', metavar='UUID')
    parser.add_argument('--revision', metavar='SHA256')
    args = parser.parse_args(argv)
    data = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local'))) / 'JarvisGemini'
    try:
        if args.menu:
            return menu()
        # Serialize voluntary CLI executions; independent of the worker mutex.
        root = data / 'sync'
        sync = NoteSync(root, None)
        lock = sync.path('.sync.lock')
        try:
            descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            raise SyncError('Outra sincronização está aberta. Se houve queda, remova somente .sync.lock da pasta dedicada.') from None
        try:
            os.close(descriptor)
            # Reload manifest after acquiring the lock.
            sync = NoteSync(root, None)
            if args.list:
                print('Pasta dedicada:', root)
                for ident, entry in sync.manifest['notes'].items():
                    print(ident, 'conflito:', entry.get('conflictRevision', '-'))
                return 0
            if args.remove:
                sync.remove(args.remove)
                print('Seleção removida. Arquivos e nota online preservados.')
                return 0
            sync.remote = OnlineNotes(Client(Vault(data / 'worker')))
            if args.select:
                result = sync.select(args.select)
            elif args.resolve:
                if not args.note or not args.revision:
                    raise SyncError('Informe --note UUID e --revision SHA256 para resolver manualmente.')
                result = sync.sync(args.note, resolve=args.resolve, expected_revision=args.revision)
            else:
                result = sync.sync(args.pull or args.sync, pull=bool(args.pull))
            print('Resultado:', result)
            print('Use --list para consultar a pasta e a revisão de conflitos.')
        finally:
            lock.unlink(missing_ok=True)
    except (SyncError, WorkerError) as error:
        print('Sincronização interrompida:', str(error))
        return 1
    except (OSError, ValueError, KeyError, TypeError):
        print('Falha ao abrir os dados de sincronização. Arquivos existentes preservados.')
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
