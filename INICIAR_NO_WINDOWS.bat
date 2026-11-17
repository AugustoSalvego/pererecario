@echo off
setlocal
cd /d "%~dp0"
echo.
echo =============================================
echo       PERERECARIO - AVENTURA NO CAMPUS
echo =============================================
echo.
echo Abrindo em http://localhost:8000
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8000'"
where py >nul 2>&1
if %errorlevel%==0 (
  py -3 -m server.server
) else (
  python -m server.server
)
if errorlevel 1 (
  echo.
  echo Nao foi possivel iniciar. Instale Python 3.11 ou mais novo.
  pause
)
