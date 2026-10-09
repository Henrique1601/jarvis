@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Instale Python 3.11 ou superior em https://www.python.org/downloads/windows/
  pause
  exit /b 1
)
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" server.py --data-dir "%~dp0data"
) else (
  py -3 server.py --data-dir "%~dp0data"
)
pause
