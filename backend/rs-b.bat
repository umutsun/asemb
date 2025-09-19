@echo off
echo ================================================================
echo                   ASB Backend Restart
echo ================================================================
echo.

echo 1. Backend node processes'leri sonlandiriliyor...
for /f "tokens=2" %%a in ('tasklist ^| findstr "node.*8083"') do (
    echo Process sonlandiriliyor: PID %%a
    taskkill //F //PID %%a 2>nul
)

echo 2. 2 saniye bekleniyor...
timeout /t 2 /nobreak >nul

echo 3. Backend baslatiliyor...
start "ASB Backend" cmd /k "npm run start"

echo.
echo ================================================================
echo                  Backend Restart Edildi!
echo ================================================================
echo.
echo Backend log'larini yeni cmd penceresinde gorebilirsiniz.
echo.
pause