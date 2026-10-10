@echo off
setlocal
cd /d "%~dp0"
echo Verificando seguranca antes de buscar pedidos. Use Ctrl+C para parar.
python worker.py run
pause
