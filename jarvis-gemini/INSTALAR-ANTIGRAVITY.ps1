$ErrorActionPreference = 'Stop'
$jarvisVersion = '1.3.2'
$jarvisUrl = 'https://storage.googleapis.com/antigravity-public/antigravity-cli/1.3.2-5813501495738368/windows-x64/cli_windows_x64.exe'
$jarvisHash = '088f449e742a72444539088df261db30010c8dee16dc32920eede24c8ab497ce3da410dd42fe4d673a36eb0c5084411399ba44f77f96389130a36027696f2120'
$jarvisArchitecture = $env:PROCESSOR_ARCHITEW6432
if (-not $jarvisArchitecture) { $jarvisArchitecture = $env:PROCESSOR_ARCHITECTURE }
if ($jarvisArchitecture -ne 'AMD64') { throw 'Este instalador requer Windows x64.' }
$jarvisTools = Join-Path $PSScriptRoot '.tools'
if ((Test-Path -LiteralPath $jarvisTools) -and ((Get-Item -LiteralPath $jarvisTools).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'A pasta .tools deve ser local ao projeto.' }
$jarvisDestination = Join-Path $jarvisTools 'antigravity'
if ((Test-Path -LiteralPath $jarvisDestination) -and ((Get-Item -LiteralPath $jarvisDestination).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'A pasta do CLI deve ser local ao projeto.' }
New-Item -ItemType Directory -Path $jarvisDestination -Force | Out-Null
$jarvisBinary = Join-Path $jarvisDestination 'agy.exe'
if (Test-Path -LiteralPath $jarvisBinary) {
    if ((Get-Item -LiteralPath $jarvisBinary).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Executavel redirecionado nao permitido.' }
    Write-Host 'Antigravity local encontrado. O Jarvis verificara o perfil em cada conversa.'
    exit 0
}
$jarvisTemp = Join-Path $jarvisDestination ('download-' + [guid]::NewGuid().ToString('N') + '.tmp')
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $jarvisUrl -OutFile $jarvisTemp -UseBasicParsing
    if ((Get-FileHash -LiteralPath $jarvisTemp -Algorithm SHA512).Hash.ToLowerInvariant() -ne $jarvisHash) { throw 'Download rejeitado: SHA512 diferente do oficial.' }
    Move-Item -LiteralPath $jarvisTemp -Destination $jarvisBinary
    @{ version = $jarvisVersion; sha512 = $jarvisHash } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $jarvisDestination 'manifest.json') -Encoding UTF8
    Write-Host 'Antigravity instalado na pasta do Jarvis.'
} finally {
    if (Test-Path -LiteralPath $jarvisTemp) { Remove-Item -LiteralPath $jarvisTemp }
}
