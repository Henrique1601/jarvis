@echo off
setlocal
cd /d "%~dp0"
py -3 -m venv .venv
if errorlevel 1 goto fail
".venv\Scripts\python.exe" -m pip install -r requirements-voice.txt
if errorlevel 1 goto fail
echo Instalacao concluida. Reinicie o Jarvis usando INICIAR.bat.
echo O modelo Whisper base sera baixado no primeiro audio.
pause
exit /b 0
:fail
echo Falha na instalacao. Verifique Python e internet.
pause
exit /b 1
