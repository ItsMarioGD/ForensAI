@echo off
title ForensIA 3D
color 0A
cd /d "%~dp0"

echo.
echo  ============================================
echo    ForensIA 3D - Iniciando servidor...
echo  ============================================
echo.

:: Usar Python conocido directamente
set PYTHON=C:\Users\explo\AppData\Local\Python\bin\python.exe

if not exist "%PYTHON%" (
    echo [AVISO] No se encontro Python en ruta predeterminada, buscando...
    where python >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Python no encontrado.
        echo Instala Python desde https://www.python.org
        echo.
        pause
        exit /b 1
    )
    set PYTHON=python
)

echo [OK] Python: %PYTHON%
echo.

:: Verificar dependencias
echo Verificando dependencias...
"%PYTHON%" -c "import fastapi, uvicorn, requests" >nul 2>&1
if errorlevel 1 (
    echo Instalando dependencias (puede tardar unos segundos)...
    "%PYTHON%" -m pip install fastapi uvicorn requests pydantic --quiet
    if errorlevel 1 (
        echo [ERROR] No se pudieron instalar dependencias.
        pause
        exit /b 1
    )
)
echo [OK] Dependencias listas
echo.

:: Iniciar Ollama si no esta corriendo
echo Verificando Ollama...
set OLLAMA_ORIGINS=*
netstat -ano 2>nul | find ":11434" >nul 2>&1
if errorlevel 1 (
    echo Iniciando Ollama en segundo plano...
    start "" /min ollama serve
    timeout /t 3 /nobreak >nul
) else (
    echo [OK] Ollama ya estaba corriendo
)
echo.

:: Liberar puerto 8000 si esta ocupado
netstat -ano | find ":8000 " >nul 2>&1
if not errorlevel 1 (
    echo [AVISO] Puerto 8000 ocupado. Liberandolo...
    for /f "tokens=5" %%a in ('netstat -ano ^| find ":8000 "') do (
        taskkill /PID %%a /F >nul 2>&1
    )
    timeout /t 1 /nobreak >nul
)

:: Abrir navegador
echo Abriendo http://localhost:8000 en el navegador...
start "" http://localhost:8000
timeout /t 1 /nobreak >nul

echo.
echo  ============================================
echo    Servidor en: http://localhost:8000
echo    NO CIERRES esta ventana mientras uses la app
echo    Para detener: CTRL+C o cierra esta ventana
echo  ============================================
echo.

:: Iniciar servidor (bloqueante)
"%PYTHON%" -m uvicorn api.main:app --host 127.0.0.1 --port 8000

:: Si llega aqui, el servidor termino
echo.
echo  ============================================
echo    El servidor se detuvo.
echo  ============================================
pause
