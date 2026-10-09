@echo off
setlocal
cd /d "%~dp0"
if not exist ".build-venv\Scripts\python.exe" py -3 -m venv .build-venv
if errorlevel 1 goto fail
".build-venv\Scripts\python.exe" -m pip install "pyinstaller==6.22.3"
if errorlevel 1 goto fail
".build-venv\Scripts\python.exe" build_windows.py
if errorlevel 1 goto fail
echo Pronto: dist\JarvisGemini\JarvisGemini.exe
echo Distribua a pasta inteira. Node.js continua necessario.
echo Microfone: use o codigo-fonte com INSTALAR-VOZ.bat.
pause
exit /b 0
:fail
echo Falha no build. Confira o erro acima e o README.md.
pause
exit /b 1
