@echo off
setlocal
cd /d "%~dp0"
set PYTHONFAULTHANDLER=1
echo Mantenha esta janela aberta enquanto usa o Jarvis local.
echo Fechar a janela encerra o servidor; o painel no navegador deixa de conectar.
if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" "%~dp0server.py" --data-dir "%~dp0data"
) else (
  where py >nul 2>nul
  if errorlevel 1 (
    echo Instale Python 3.11 ou superior em https://www.python.org/downloads/windows/
    pause
    exit /b 1
  )
  py -3 "%~dp0server.py" --data-dir "%~dp0data"
)
set jarvisExit=%errorlevel%
echo.
echo O servidor local foi encerrado. Codigo de saida: %jarvisExit%
echo Abra INICIAR.bat novamente e recarregue o painel para reconectar.
pause
exit /b %jarvisExit%
