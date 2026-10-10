"""Build the Windows text/SAPI application and copy its setup tools."""
from pathlib import Path
import json
import shutil
import subprocess
import sys
from server import VERSION

root = Path(__file__).resolve().parent
if sys.platform != 'win32':
    raise SystemExit('Compile este executável no Windows.')
subprocess.run([
    sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
    '--name', 'JarvisGemini', '--add-data', 'web;web', '--add-data', 'vault;vault',
    'server.py',
], cwd=root, check=True)
destination = root / 'dist/JarvisGemini'
for name in ('CONFIGURAR-GEMINI.bat', 'CONFIGURAR-ANTIGRAVITY.bat', 'INSTALAR-ANTIGRAVITY.ps1', 'LEIA-PRIMEIRO.txt', 'README.md', 'VALIDACAO.md'):
    shutil.copy2(root / name, destination / name)
(destination / 'release.json').write_text(json.dumps({'version': VERSION}), encoding='utf-8')
print(destination / 'JarvisGemini.exe')
