@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale Node.js LTS em https://nodejs.org/ e abra este arquivo novamente.
  pause
  exit /b 1
)
if not exist ".tools\node_modules\@google\gemini-cli\bundle\gemini.js" (
  call npm install --prefix .tools --cache .npm-cache --no-audit --no-fund
  if errorlevel 1 (
    echo Falha na instalacao do Gemini CLI.
    pause
    exit /b 1
  )
)
echo Escolha Login with Google e use a conta do seu Google AI Pro.
echo Depois do login, teste uma mensagem. Use /quit para sair.
echo O Jarvis usa a autenticacao salva pelo CLI. Nunca envie sua senha.
set GEMINI_API_KEY=
set GOOGLE_API_KEY=
set GOOGLE_GENAI_USE_VERTEXAI=
call ".tools\node_modules\.bin\gemini.cmd"
pause
