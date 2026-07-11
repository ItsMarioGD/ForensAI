# ForensIA 3D - Script de inicio para PowerShell
# Doble clic en este archivo o ejecutar: powershell -ExecutionPolicy Bypass -File iniciar.ps1

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "ForensIA 3D"

# Ir al directorio del script
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "    ForensIA 3D - Reconstruccion Forense" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# --- Buscar Python ---
$pythonPaths = @(
    "C:\Users\explo\AppData\Local\Python\bin\python.exe",
    "C:\Python312\python.exe",
    "C:\Python311\python.exe",
    "C:\Python310\python.exe"
)

$PYTHON = $null
foreach ($p in $pythonPaths) {
    if (Test-Path $p) { $PYTHON = $p; break }
}

if (-not $PYTHON) {
    # Intentar desde el PATH
    try { $PYTHON = (Get-Command python -ErrorAction Stop).Source } catch {}
}

if (-not $PYTHON) {
    Write-Host "[ERROR] Python no encontrado." -ForegroundColor Red
    Write-Host "Instala Python desde https://www.python.org" -ForegroundColor Yellow
    Read-Host "Presiona Enter para salir"
    exit 1
}

Write-Host "[OK] Python: $PYTHON" -ForegroundColor Green

# --- Verificar dependencias ---
Write-Host "Verificando dependencias..." -ForegroundColor Yellow
$check = & $PYTHON -c "import fastapi, uvicorn, requests, pydantic; print('ok')" 2>&1
if ($check -ne "ok") {
    Write-Host "Instalando dependencias (pip)..." -ForegroundColor Yellow
    & $PYTHON -m pip install fastapi uvicorn requests pydantic --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Fallo la instalacion de dependencias." -ForegroundColor Red
        Read-Host "Presiona Enter para salir"
        exit 1
    }
}
Write-Host "[OK] Dependencias listas" -ForegroundColor Green

# --- Iniciar Ollama ---
Write-Host "Iniciando Ollama..." -ForegroundColor Yellow
$env:OLLAMA_ORIGINS = "*"
$env:OLLAMA_HOST = "0.0.0.0"

$ollamaRunning = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 2 -ErrorAction Stop
    $ollamaRunning = $true
    Write-Host "[OK] Ollama ya estaba corriendo" -ForegroundColor Green
} catch {
    # Intentar iniciar ollama
    try {
        Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 3
        Write-Host "[OK] Ollama iniciado" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] No se pudo iniciar Ollama automaticamente." -ForegroundColor Yellow
        Write-Host "       Ejecuta manualmente: ollama serve" -ForegroundColor Yellow
    }
}

# --- Abrir navegador ---
Write-Host ""
Write-Host "Abriendo navegador en http://localhost:8001 ..." -ForegroundColor Cyan
Start-Sleep -Seconds 1
Start-Process "http://localhost:8001"

# --- Iniciar servidor ---
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "    Servidor activo: http://localhost:8001" -ForegroundColor Green
Write-Host "    Presiona CTRL+C para detener" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""

try {
    & $PYTHON -m uvicorn api.main:app --host 127.0.0.1 --port 8001
} catch {
    Write-Host ""
    Write-Host "[ERROR] El servidor fallo: $_" -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
}
