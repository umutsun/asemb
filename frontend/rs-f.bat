@echo off
echo ================================================================
echo                   ASB Frontend Restart
echo ================================================================
echo.

echo 1. Frontend node processes'leri sonlandiriliyor...
for /f "tokens=2" %%a in ('tasklist ^| findstr "node.*3000"') do (
    echo Process sonlandiriliyor: PID %%a
    taskkill //F //PID %%a 2>nul
)

echo 2. 2 saniye bekleniyor...
timeout /t 2 /nobreak >nul

echo 3. Frontend baslatiliyor...
start "ASB Frontend" cmd /k "npm run dev"

echo.
echo ================================================================
echo                  Frontend Restart Edildi!
echo ================================================================
echo.
echo Frontend tarayicida http://localhost:3000 adresinde acilacak.
echo.
pause