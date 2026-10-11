import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sync_notes import NoteSync, SyncError, OnlineNotes
from worker import WorkerError

ID = '11111111-1111-4111-8111-111111111111'


class Remote:
    def __init__(self):
        self.content = 'initial'
        self.writes = 0
        self.fail = False

    def __call__(self, name, data):
        if self.fail:
            raise WorkerError('auth_required', 'safe', 401)
        revision = hashlib.sha256(self.content.encode()).hexdigest()
        if name == 'note-update':
            if data['revision'] != revision:
                raise WorkerError('connection_error', 'safe', 409)
            self.content = data['content']
            self.writes += 1
        return {'id': ID, 'title': 'Synthetic', 'content': self.content,
                'revision': hashlib.sha256(self.content.encode()).hexdigest()}


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1])
        self.addCleanup(self.temp.cleanup)
        self.remote = Remote()
        self.sync = NoteSync(Path(self.temp.name) / 'sync', self.remote)
        self.sync.select(ID)
        self.file = self.sync.path(ID + '.md')

    def test_duplicate_pull_is_noop(self):
        self.assertEqual(self.sync.sync(ID, pull=True), 'unchanged')
        self.assertEqual(self.remote.writes, 0)

    def test_local_only_upload(self):
        self.file.write_text('local', encoding='utf-8')
        self.assertEqual(self.sync.sync(ID), 'uploaded')
        self.assertEqual(self.remote.content, 'local')

    def test_remote_only_backups_local(self):
        self.remote.content = 'remote'
        self.assertEqual(self.sync.sync(ID), 'downloaded')
        backups = list(self.sync.path('backups').glob('*.md'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(), 'initial')
        self.assertEqual(self.file.read_text(), 'remote')

    def test_conflict_preserves_both_and_requires_revision(self):
        self.file.write_text('local', encoding='utf-8')
        self.remote.content = 'remote'
        self.assertEqual(self.sync.sync(ID), 'conflict')
        self.assertEqual(self.file.read_text(), 'local')
        self.assertEqual(self.sync.path(ID + '.cloud.md').read_text(), 'remote')
        with self.assertRaises(SyncError):
            self.sync.sync(ID, resolve='local', expected_revision='0' * 64)
        revision = hashlib.sha256(b'remote').hexdigest()
        self.assertEqual(self.sync.sync(ID, resolve='local', expected_revision=revision), 'uploaded')

    def test_pull_does_not_upload_or_overwrite_local_change(self):
        self.file.write_text('local', encoding='utf-8')
        self.assertEqual(self.sync.sync(ID, pull=True), 'local_changed')
        self.assertEqual(self.remote.writes, 0)

    def test_auth_failure_preserves_file(self):
        self.remote.fail = True
        with self.assertRaises(WorkerError):
            self.sync.sync(ID)
        self.assertEqual(self.file.read_text(), 'initial')

    def test_traversal_and_invalid_ids(self):
        with self.assertRaises(SyncError):
            self.sync.path('../escape')
        with self.assertRaises(SyncError):
            self.sync.select('../../secret')

    def test_remove_keeps_files(self):
        self.sync.remove(ID)
        self.assertTrue(self.file.exists())
        with self.assertRaises(SyncError):
            self.sync.sync(ID)

    def test_concurrent_local_edit_before_download_is_preserved(self):
        self.remote.content = 'remote'
        original = self.sync.backup
        def backup(*args):
            original(*args)
            self.file.write_text('concurrent', encoding='utf-8')
        self.sync.backup = backup
        with self.assertRaises(SyncError):
            self.sync.sync(ID)
        self.assertEqual(self.file.read_text(), 'concurrent')

    def test_successful_remote_write_lost_response_recovers_without_repeat(self):
        self.file.write_text('local', encoding='utf-8')
        original = self.sync.remote
        def request(name, data):
            result = original(name, data)
            if name == 'note-update':
                raise WorkerError('connection_error', 'safe')
            return result
        self.sync.remote = request
        with self.assertRaises(WorkerError):
            self.sync.sync(ID)
        self.sync.remote = original
        self.assertEqual(self.sync.sync(ID), 'unchanged')
        self.assertEqual(self.remote.writes, 1)

    def test_bad_cloud_revision_preserves_local(self):
        self.sync.remote = lambda *_: {'id': ID, 'content': 'invalid', 'revision': 'invalid'}
        with self.assertRaises(SyncError):
            self.sync.sync(ID)
        self.assertEqual(self.file.read_text(), 'initial')

    def test_size_limit_refuses_upload(self):
        self.file.write_text('x' * 200001, encoding='utf-8')
        with self.assertRaises(SyncError):
            self.sync.sync(ID)
        self.assertEqual(self.remote.writes, 0)

    def test_symbolic_link_is_rejected(self):
        original = Path.is_symlink
        def linked(path):
            return path == self.file or original(path)
        with patch.object(Path, 'is_symlink', linked):
            with self.assertRaises(SyncError):
                self.sync.sync(ID)

    def test_session_expiry_does_not_call_request_or_refresh(self):
        from unittest.mock import Mock
        client = Mock()
        client.vault.read.return_value = {'origin': 'https://jarvis-ten-pi-14.vercel.app', 'expiresAt': 0}
        online = OnlineNotes(client)
        with self.assertRaises(SyncError):
            online('note-read', {'id': ID})
        client.requester.assert_not_called()
        client.token.assert_not_called()

    def test_multiple_conflicts_preserve_previous_cloud_copy(self):
        self.file.write_text('local', encoding='utf-8')
        self.remote.content = 'remote1'
        self.sync.sync(ID)
        self.remote.content = 'remote2'
        self.sync.sync(ID)
        self.assertEqual(self.sync.path(ID + '.cloud.md').read_text(), 'remote2')
        backups = list(self.sync.path('backups').glob('*.md'))
        self.assertEqual(backups[0].read_text(), 'remote1')

    def test_cloud_resolution_preserves_local_backup(self):
        self.file.write_text('local', encoding='utf-8')
        self.remote.content = 'remote'
        self.sync.sync(ID)
        revision = hashlib.sha256(b'remote').hexdigest()
        self.assertEqual(self.sync.sync(ID, resolve='cloud', expected_revision=revision), 'downloaded')
        self.assertEqual(self.file.read_text(), 'remote')
        backups = list(self.sync.path('backups').glob('*.md'))
        self.assertEqual(backups[0].read_text(), 'local')

    def test_server_revision_is_opaque_and_may_include_metadata(self):
        self.sync.remote = lambda *_: {'id': ID, 'title': 'Opaque', 'content': 'initial', 'revision': 'a' * 64}
        self.assertEqual(self.sync.sync(ID), 'unchanged')
        self.assertEqual(self.sync.manifest['notes'][ID]['revision'], 'a' * 64)
        self.assertEqual(self.sync.manifest['notes'][ID]['hash'], hashlib.sha256(b'initial').hexdigest())

    def test_metadata_only_revision_change_adopts_new_baseline(self):
        self.sync.remote = lambda *_: {'id': ID, 'title': 'Changed tags', 'content': 'initial', 'revision': 'b' * 64}
        self.assertEqual(self.sync.sync(ID), 'unchanged')
        self.file.write_text('local', encoding='utf-8')
        revision_sent = []
        def remote(endpoint, data):
            if endpoint == 'note-update':
                revision_sent.append(data['revision'])
                return {'id': ID, 'content': data['content'], 'revision': 'c' * 64}
            return {'id': ID, 'content': 'initial', 'revision': 'b' * 64}
        self.sync.remote = remote
        self.assertEqual(self.sync.sync(ID), 'uploaded')
        self.assertEqual(revision_sent, ['b' * 64])

    def test_unicode_payload_transport_limit_prevents_send(self):
        from unittest.mock import Mock
        client = Mock()
        online = OnlineNotes(client)
        with self.assertRaisesRegex(SyncError, '250 KB'):
            online('note-update', {'id': ID, 'revision': 'd' * 64, 'content': 'é' * 50000})
        client.requester.assert_not_called()

