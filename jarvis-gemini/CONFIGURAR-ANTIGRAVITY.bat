@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR-ANTIGRAVITY.ps1"
if errorlevel 1 goto falha
echo Entre com sua conta Google no navegador oficial aberto pelo Antigravity.
echo Nunca envie sua senha ou codigo de login pelo chat.
echo Depois do login, use /quit e Testar conexao IA no painel do Jarvis.
set GEMINI_API_KEY=
set GOOGLE_API_KEY=
set GOOGLE_GENAI_USE_VERTEXAI=
"%~dp0.tools\antigravity\agy.exe"
pause
exit /b 0
:falha
echo Nao foi possivel preparar o Antigravity. Confira a mensagem acima.
pause
exit /b 1
