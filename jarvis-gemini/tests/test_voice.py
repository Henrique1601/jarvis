"""Synthetic microphone data only: validation and isolated voice failures."""
import io
import json
import struct
import sys
import tempfile
import threading
import types
import unittest
import wave
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def wav_bytes(channels=1, width=2, rate=16000, frames=160):
    output = io.BytesIO()
    with wave.open(output, 'wb') as audio:
        audio.setnchannels(channels)
        audio.setsampwidth(width)
        audio.setframerate(rate)
        audio.writeframes(b'\0' * channels * width * frames)
    return output.getvalue()


class VoiceValidationTests(unittest.TestCase):
    def test_invalid_wav_is_user_error_before_loading_voice(self):
        with patch.object(server.importlib.util, 'find_spec', return_value=object()) as find_spec:
            with self.assertRaises(ValueError):
                server.transcribe(b'not a WAV file')
        find_spec.assert_not_called()

    def test_empty_corrupt_or_unsupported_recordings_are_user_errors(self):
        zero_rate = bytearray(wav_bytes())
        struct.pack_into('<I', zero_rate, 24, 0)
        samples = {
            'empty': b'',
            'empty_frames': wav_bytes(frames=0),
            'partial_header': b'RIFF\0\0\0\0WAVE',
            'stereo': wav_bytes(channels=2),
            '8bit': wav_bytes(width=1),
            'rate_zero': bytes(zero_rate),
            'rate_too_high': wav_bytes(rate=192000),
            'over_60_seconds': wav_bytes(rate=8000, frames=480001),
            'truncated_frames': wav_bytes()[:-2],
        }
        for label, data in samples.items():
            with self.subTest(label=label):
                with patch.object(server.importlib.util, 'find_spec', return_value=object()):
                    with self.assertRaises(ValueError):
                        server.transcribe(data)

    def test_voice_not_installed_has_actionable_error(self):
        with patch.object(server.importlib.util, 'find_spec', return_value=None):
            with self.assertRaises(server.VoiceError) as raised:
                server.transcribe(wav_bytes())
        self.assertIn('INSTALAR-VOZ.bat', str(raised.exception))

    def test_import_failure_is_safe_and_actionable(self):
        with patch.object(server.importlib.util, 'find_spec', return_value=object()), \
                patch.dict(sys.modules, {'faster_whisper': None}), \
                patch.object(server, 'MODEL', None):
            with self.assertRaises(server.VoiceError) as raised:
                server.transcribe(wav_bytes())
        self.assertIn('INSTALAR-VOZ.bat', str(raised.exception))
        self.assertNotIn('No module', str(raised.exception))

    def test_model_initialization_failure_is_safe_and_retryable(self):
        private_error = 'synthetic-private-model-error'
        model_factory = MagicMock(side_effect=RuntimeError(private_error))
        module = types.SimpleNamespace(WhisperModel=model_factory)
        with patch.object(server.importlib.util, 'find_spec', return_value=object()), \
                patch.dict(sys.modules, {'faster_whisper': module}), \
                patch.object(server, 'MODEL', None):
            with self.assertRaises(server.VoiceError) as raised:
                server.transcribe(wav_bytes())
            self.assertIsNone(server.MODEL)
        self.assertNotIn(private_error, str(raised.exception))
        self.assertFalse(server.VOICE_LOCK.locked())

    def test_valid_recording_at_duration_limit_returns_transcript(self):
        model = MagicMock()
        model.transcribe.return_value = ([types.SimpleNamespace(text=' Olá '),
                                          types.SimpleNamespace(text=' mundo ')], None)
        module = types.SimpleNamespace(WhisperModel=MagicMock(return_value=model))
        with patch.object(server.importlib.util, 'find_spec', return_value=object()), \
                patch.dict(sys.modules, {'faster_whisper': module}), \
                patch.object(server, 'MODEL', None), \
                patch.object(server.tempfile, 'tempdir', str(Path(__file__).resolve().parent)):
            self.assertEqual(server.transcribe(wav_bytes(rate=8000, frames=480000)), 'Olá mundo')
        audio_path = Path(model.transcribe.call_args.args[0])
        self.assertFalse(audio_path.exists())

    def test_lazy_segment_failure_is_safe_and_cleans_recording(self):
        def failing_segments():
            yield types.SimpleNamespace(text='Partial transcript')
            raise RuntimeError('synthetic-private-lazy-error')

        model = MagicMock()
        model.transcribe.return_value = (failing_segments(), None)
        module = types.SimpleNamespace(WhisperModel=MagicMock(return_value=model))
        with patch.object(server.importlib.util, 'find_spec', return_value=object()), \
                patch.dict(sys.modules, {'faster_whisper': module}), \
                patch.object(server, 'MODEL', None), \
                patch.object(server.tempfile, 'tempdir', str(Path(__file__).resolve().parent)):
            with self.assertRaises(server.VoiceError) as raised:
                server.transcribe(wav_bytes())
        self.assertNotIn('synthetic-private-lazy-error', str(raised.exception))
        self.assertFalse(Path(model.transcribe.call_args.args[0]).exists())
        self.assertFalse(server.VOICE_LOCK.locked())


class VoiceHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.addCleanup(self.temp.cleanup)
        self.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.http.store = server.Store(Path(self.temp.name))
        self.http.token = 'synthetic-voice-token'
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_http)
        self.base = f'http://127.0.0.1:{self.http.server_port}/api/'

    def stop_http(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join(timeout=5)
        self.assertFalse(self.thread.is_alive())

    def request(self, route, body=None):
        req = Request(self.base + route, data=body,
                      headers={'X-Jarvis-Token': self.http.token})
        try:
            with urlopen(req, timeout=10) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            try:
                return error.code, json.load(error)
            finally:
                error.close()

    def assert_server_and_chat_usable(self):
        self.assertEqual(self.request('state')[0], 200)
        with patch.object(server.antigravity, 'ask', return_value='Resposta após falha de voz'):
            status, message = self.request('chat', json.dumps({'text': 'Pedido sintético'}).encode())
        self.assertEqual(status, 200, message)
        self.assertEqual(message['content'], 'Resposta após falha de voz')

    def test_invalid_audio_returns_400_and_chat_stays_usable(self):
        with patch.object(server.importlib.util, 'find_spec', return_value=object()):
            status, result = self.request('transcribe', b'synthetic invalid audio')
        self.assertEqual(status, 400)
        self.assertIn('WAV', result['error'])
        self.assert_server_and_chat_usable()

    def test_decode_dependency_failure_returns_503_without_stopping_chat(self):
        model = MagicMock()
        private_marker = 'synthetic-private-audio-marker'
        model.transcribe.side_effect = TypeError('metadata_errors ' + private_marker)
        module = types.SimpleNamespace(WhisperModel=MagicMock(return_value=model))
        with patch.object(server.importlib.util, 'find_spec', return_value=object()), \
                patch.dict(sys.modules, {'faster_whisper': module}), \
                patch.object(server, 'MODEL', None), \
                patch.object(server.tempfile, 'tempdir', str(Path(__file__).resolve().parent)), \
                patch('sys.stdout', new_callable=io.StringIO) as stdout, \
                patch('sys.stderr', new_callable=io.StringIO) as stderr:
            status, result = self.request('transcribe', wav_bytes())
        self.assertEqual(status, 503)
        self.assertIn('INSTALAR-VOZ.bat', result['error'])
        self.assertNotIn(private_marker, result['error'])
        self.assertNotIn(private_marker, stdout.getvalue() + stderr.getvalue())
        self.assertFalse(server.VOICE_LOCK.locked())
        self.assertFalse(Path(model.transcribe.call_args.args[0]).exists())
        self.assert_server_and_chat_usable()


if __name__ == '__main__':
    unittest.main()
