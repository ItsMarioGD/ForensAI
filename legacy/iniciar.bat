@echo off
title ForensIA 3D - Iniciando servidor
color 0A
cd /d "%~dp0"
echo.
echo ============================================
echo    ForensIA 3D - Iniciando servidor...
echo ============================================
echo.
:: Verify we are in the correct directory
echo Directorio actual: %cd%
echo.

:: Verify the required backend file exists
if not exist "api\main.py" (
    echo [ERROR] Archivo api\main.py no encontrado en %cd%
    pause
    exit /b 1
)

:: Check for a REAL Python (not the Microsoft Store alias stub)
set "PYEXE="
set "PYCHECK=%TEMP%\pycheck_%RANDOM%.txt"

python --version >"%PYCHECK%" 2>&1
findstr /C:"was not found" "%PYCHECK%" >nul
if not errorlevel 1 (
    goto :try_py_launcher
)
if errorlevel 1 (
    findstr /R "^Python [0-9]" "%PYCHECK%" >nul
    if not errorlevel 1 (
        set "PYEXE=python"
        goto :python_found
    )
)

:try_py_launcher
py -3 --version >"%PYCHECK%" 2>&1
findstr /R "^Python [0-9]" "%PYCHECK%" >nul
if not errorlevel 1 (
    set "PYEXE=py -3"
    goto :python_found
)

:: Neither "python" nor "py -3" work as real interpreters
del "%PYCHECK%" >nul 2>&1
echo [ERROR] No se encontro una instalacion real de Python.
echo.
echo Esto suele pasar por el "alias de ejecucion" de Windows ^(python.exe
echo apunta a la Microsoft Store en vez de a Python real^). Para solucionarlo:
echo.
echo   1^) Ve a: Configuracion - Aplicaciones - Aplicaciones avanzadas
echo      - Alias de ejecucion de aplicaciones
echo      y DESACTIVA "python.exe" y "python3.exe"
echo.
echo   2^) Si no tienes Python instalado, descargalo de:
echo      https://www.python.org/downloads/
echo      y marca la casilla "Add Python to PATH" durante la instalacion.
echo.
echo   3^) Cierra esta ventana y vuelve a ejecutar este script.
echo.
pause
exit /b 1

:python_found
del "%PYCHECK%" >nul 2>&1
echo [OK] Python encontrado (%PYEXE%).
:: Verify and install required Python packages
echo.
echo Verificando dependencias...
%PYEXE% -c "import fastapi, uvicorn, requests, pydantic" >nul 2>&1
if errorlevel 1 (
    echo Dependencias faltantes, instalando...
    %PYEXE% -m pip install fastapi uvicorn requests pydantic --quiet
    if errorlevel 1 (
        echo.
        echo [ERROR] No se pudieron instalar las dependencias.
        echo Por favor, ejecuta manualmente: pip install fastapi uvicorn requests pydantic
        pause
        exit /b 1
    )
)
echo [OK] Todas las dependencias estan listas.
echo.

:: Optional: check Ollama (informational only)
echo.
echo Verificando disponibilidad de Ollama (opcional)...
%PYEXE% -c "import requests" >nul 2>&1
if errorlevel 1 (
    echo [ADVERTENCIA] El modulo 'requests' no esta disponible; algunas funciones pueden fallar.
) else (
    echo [OK] Ollama puede estar disponible ^(se verificara en tiempo de ejecucion si se necesita^).
)
echo.

:: Intentar abrir el puerto 8001 en el Firewall de Windows (requiere permisos de administrador)
echo Configurando Firewall de Windows para el puerto 8001...
netsh advfirewall firewall show rule name="ForensIA3D_8001" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="ForensIA3D_8001" dir=in action=allow protocol=TCP localport=8001 >nul 2>&1
    if errorlevel 1 (
        echo [ADVERTENCIA] No se pudo crear la regla de firewall automaticamente.
        echo Si otros equipos no logran conectarse, ejecuta este .bat como Administrador
        echo o agrega manualmente una regla para el puerto TCP 8001.
    ) else (
        echo [OK] Regla de firewall creada para el puerto 8001.
    )
) else (
    echo [OK] Regla de firewall ya existente.
)
echo.

:: Show connection info
echo.
echo ============================================
echo    Servidor local:  http://127.0.0.1:8001
echo.
echo    NO CIERRES esta ventana mientras usas la app
echo    Para detener: Ctrl+C o cierra esta ventana
echo ============================================
echo.

:: Start the server (blocking) - 127.0.0.1 escucha unicamente en la maquina local
echo Iniciando servidor FastAPI en localhost...
echo.
%PYEXE% -m uvicorn api.main:app --host 127.0.0.1 --port 8001

:: If the server stops (error or manual Ctrl+C), show message and wait for key press
echo.
echo ============================================
echo     El servidor se ha detenido.
echo ============================================
pause
exit /b 0