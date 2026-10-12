@echo off
setlocal
cd /d "%~dp0"
echo Jarvis Worker - inicio automatico exige escolha explicita e gates aprovados.
echo 1. Conectar conta Supabase e registrar dispositivo
echo 2. Verificar contrato CLI sem enviar pedido
echo 3. Pausar worker
echo 4. Preparar retomada manual
echo 5. Desconectar e revogar dispositivo
echo 6. Consultar estado local
echo 7. Instalar inicio ao logon, somente se todos os gates passarem
echo 8. Desativar inicio automatico
echo 9. Consultar status da tarefa agendada
choice /c 123456789 /n /m "Escolha: "
if errorlevel 9 (powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INICIALIZACAO-WORKER.ps1" -Action Status) else if errorlevel 8 (powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INICIALIZACAO-WORKER.ps1" -Action Disable) else if errorlevel 7 (powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INICIALIZACAO-WORKER.ps1" -Action Install) else if errorlevel 6 (python worker.py status) else if errorlevel 5 (python worker.py disconnect) else if errorlevel 4 (python worker.py resume) else if errorlevel 3 (python worker.py pause) else if errorlevel 2 (python worker.py probe) else (python worker.py setup)
pause
