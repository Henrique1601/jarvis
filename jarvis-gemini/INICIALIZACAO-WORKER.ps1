param([ValidateSet('Install', 'Disable')][string]$Action = 'Install')
$ErrorActionPreference = 'Stop'
$jarvisTaskName = 'JarvisWorker'
$jarvisUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if ($Action -eq 'Disable') {
    $jarvisExisting = Get-ScheduledTask -TaskName $jarvisTaskName -ErrorAction SilentlyContinue
    if ($jarvisExisting) {
        if ($jarvisExisting.Principal.UserId -notin @($jarvisUser, [Security.Principal.WindowsIdentity]::GetCurrent().User.Value)) { throw 'A tarefa pertence a outro usuario; nenhuma alteracao realizada.' }
        Stop-ScheduledTask -TaskName $jarvisTaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $jarvisTaskName -Confirm:$false
    }
    Write-Host 'Inicializacao automatica do worker desativada.'
    exit 0
}
# Discover once, then pin absolute executables in the task. No cmd/PATH or secrets
# are placed in the Task XML; no administrator or password is requested.
$jarvisPythonCommand = Get-Command python.exe -CommandType Application -ErrorAction Stop
$jarvisPython = (& $jarvisPythonCommand.Source -c 'import sys; print(sys.executable)').Trim()
if ($LASTEXITCODE -ne 0 -or -not [IO.Path]::IsPathRooted($jarvisPython) -or -not (Test-Path -LiteralPath $jarvisPython -PathType Leaf)) { throw 'Python instalado nao confirmado.' }
$jarvisPythonW = Join-Path (Split-Path -Parent $jarvisPython) 'pythonw.exe'
if (-not (Test-Path -LiteralPath $jarvisPythonW -PathType Leaf)) { throw 'pythonw.exe nao encontrado; tarefa nao criada.' }
$jarvisWorker = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'worker.py')).Path
if ((Get-Item -LiteralPath $jarvisWorker).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'worker.py precisa ser um arquivo local.' }
# Both protocol initialization and the administrative online gate must pass.
& $jarvisPython $jarvisWorker startup-check
if ($LASTEXITCODE -ne 0) { throw 'Verificacao de seguranca recusada. Nenhuma tarefa foi registrada.' }
$jarvisArguments = '"' + $jarvisWorker + '" run'
$jarvisExisting = Get-ScheduledTask -TaskName $jarvisTaskName -ErrorAction SilentlyContinue
if ($jarvisExisting -and ($jarvisExisting.Principal.UserId -notin @($jarvisUser, [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) -or $jarvisExisting.Actions.Execute -ne $jarvisPythonW -or $jarvisExisting.Actions.Arguments -ne $jarvisArguments)) { throw 'Existe outra tarefa com este nome; nenhuma alteracao realizada.' }
$jarvisTaskAction = New-ScheduledTaskAction -Execute $jarvisPythonW -Argument $jarvisArguments -WorkingDirectory $PSScriptRoot
$jarvisTrigger = New-ScheduledTaskTrigger -AtLogOn -User $jarvisUser
$jarvisPrincipal = New-ScheduledTaskPrincipal -UserId $jarvisUser -LogonType Interactive -RunLevel Limited
$jarvisSettings = New-ScheduledTaskSettingsSet -Hidden -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $jarvisTaskName -Action $jarvisTaskAction -Trigger $jarvisTrigger -Principal $jarvisPrincipal -Settings $jarvisSettings -Description 'Jarvis worker pessoal, HTTPS de saida, validacao de protocolo obrigatoria.' -Force | Out-Null
Write-Host 'Inicializacao registrada somente para o proximo logon deste usuario. Nenhum worker foi iniciado agora.'
