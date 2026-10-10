$ErrorActionPreference = 'Stop'
$jarvisVersion = '1.3.3'
$jarvisUrl = 'https://storage.googleapis.com/antigravity-public/antigravity-cli/1.3.3-5524738307653632/windows-x64/cli_windows_x64.exe'
$jarvisHash = 'ec15855bd5de768232c0aee31d11eac636a9e7d8bc4ad3dbe3887a9797f7fd821cafabba61482cd5515674a05246be2b7f96ca3f17e38c6a3f7431a2a3aff81f'
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
    if ((Get-FileHash -LiteralPath $jarvisBinary -Algorithm SHA512).Hash.ToLowerInvariant() -eq $jarvisHash) {
        Write-Host 'Antigravity local verificado. O Jarvis verificara o perfil em cada conversa.'
        exit 0
    }
}
$jarvisTemp = Join-Path $jarvisDestination ('download-' + [guid]::NewGuid().ToString('N') + '.tmp')
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $jarvisUrl -OutFile $jarvisTemp -UseBasicParsing
    if ((Get-FileHash -LiteralPath $jarvisTemp -Algorithm SHA512).Hash.ToLowerInvariant() -ne $jarvisHash) { throw 'Download rejeitado: SHA512 diferente do oficial.' }
    if (Test-Path -LiteralPath $jarvisBinary) {
        $jarvisPreviousHash = (Get-FileHash -LiteralPath $jarvisBinary -Algorithm SHA512).Hash.ToLowerInvariant()
        $jarvisPrevious = Join-Path $jarvisDestination ('previous-' + $jarvisPreviousHash.Substring(0, 12) + '.exe')
        if (-not (Test-Path -LiteralPath $jarvisPrevious)) { Copy-Item -LiteralPath $jarvisBinary -Destination $jarvisPrevious }
    }
    Move-Item -LiteralPath $jarvisTemp -Destination $jarvisBinary -Force
    @{ version = $jarvisVersion; sha512 = $jarvisHash } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $jarvisDestination 'manifest.json') -Encoding UTF8
    Write-Host 'Antigravity instalado na pasta do Jarvis.'
} finally {
    if (Test-Path -LiteralPath $jarvisTemp) { Remove-Item -LiteralPath $jarvisTemp }
}
