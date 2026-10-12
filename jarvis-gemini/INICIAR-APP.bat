@echo off
setlocal
cd /d "%~dp0"
set PYTHONFAULTHANDLER=1
echo Iniciando Jarvis em modo janela desktop dedicada (App Mode)...
echo Mantenha esta janela de servico ativa enquanto usa o aplicativo.
if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" "%~dp0server.py" --data-dir "%~dp0data" --app-window
) else (
  where py >nul 2>nul
  if errorlevel 1 (
    echo Instale Python 3.11 ou superior em https://www.python.org/downloads/windows/
    pause
    exit /b 1
  )
  py -3 "%~dp0server.py" --data-dir "%~dp0data" --app-window
)
set jarvisExit=%errorlevel%
echo.
echo O servidor local foi encerrado. Codigo de saida: %jarvisExit%
pause
exit /b %jarvisExit%
