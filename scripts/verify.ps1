$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Push-Location services\api
if (-not (Test-Path .\.venv\Scripts\python.exe)) {
  python -m venv .venv
}
.\.venv\Scripts\pip install -r requirements-dev.txt -q
.\.venv\Scripts\pytest -q
Pop-Location

Push-Location apps\web
if (Test-Path .next) { Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue }
npm install --no-fund --no-audit
npm run build
Pop-Location

Write-Host "verify.ps1: OK"
