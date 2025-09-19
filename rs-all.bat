@echo off
echo ================================================================
echo               ASB Full System Restart
echo ================================================================
echo.

echo 1. Backend processes sonlandiriliyor...
for /f "tokens=2" %%a in ('tasklist ^| findstr "node.*8083"') do (
    echo Backend process sonlandiriliyor: PID %%a
    taskkill //F //PID %%a 2>nul
)

echo 2. Frontend processes sonlandiriliyor...
for /f "tokens=2" %%a in ('tasklist ^| findstr "node.*3000"') do (
    echo Frontend process sonlandiriliyor: PID %%a
    taskkill //F //PID %%a 2>nul
)

echo 3. 3 saniye bekleniyor...
timeout /t 3 /nobreak >nul

echo 4. Backend baslatiliyor...
start "ASB Backend" cmd /k "cd backend && npm run start"

timeout /t 2 /nobreak >nul

echo 5. Frontend baslatiliyor...
start "ASB Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ================================================================
echo              Sistem Tamamen Restart Edildi!
echo ================================================================
echo.
echo Backend: http://localhost:8083
echo Frontend: http://localhost:3000
echo.
echo Her iki servis de ayri cmd pencerelerinde calisiyor.
echo.
pause