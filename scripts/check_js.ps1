$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$nodePath = "C:\Program Files\nodejs\node.exe"
$appJsPath = Join-Path $repoRoot "src\js\app.js"

if (-not (Test-Path $nodePath)) {
  throw "Node が見つかりません: $nodePath"
}

if (-not (Test-Path $appJsPath)) {
  throw "app.js が見つかりません: $appJsPath"
}

& $nodePath --check $appJsPath
Write-Host "JavaScript syntax check passed: $appJsPath"
