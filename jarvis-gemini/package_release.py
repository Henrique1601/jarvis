"""Package only distributable source and Windows build; never include user data."""
import hashlib
import json
from pathlib import Path
import zipfile
from server import VERSION

root = Path(__file__).resolve().parent
output = root.parent
release = '.'.join(VERSION.split('.')[:2])
source = output / f'Jarvis-Gemini-{release}-Previa-Codigo.zip'
windows = output / f'Jarvis-Gemini-{release}-Previa-Windows.zip'
files = [p for p in root.iterdir() if p.is_file() and (p.suffix in ('.py', '.bat', '.ps1', '.txt', '.md') or p.name == '.gitignore')]
for folder in ('web', 'vault', 'tests'):
    files.extend(p for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(files):
        if path.is_file():
            archive.write(path, 'jarvis-gemini/' + path.relative_to(root).as_posix())
destination = root / 'dist/JarvisGemini'
assert (destination / 'JarvisGemini.exe').is_file(), 'Compile o executável antes de empacotar.'
assert json.loads((destination / 'release.json').read_text(encoding='utf-8'))['version'] == VERSION, 'Recompile o executável para esta versão antes de empacotar.'
with zipfile.ZipFile(windows, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(destination.rglob('*')):
        if path.is_file():
            archive.write(path, 'JarvisGemini/' + path.relative_to(destination).as_posix())
lines = []
for path in (source, windows):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
    checksum = hashlib.sha256(path.read_bytes()).hexdigest()
    lines.append(checksum + '  ' + path.name)
    print(path.name, path.stat().st_size, 'bytes')
(output / 'SHA256SUMS.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
